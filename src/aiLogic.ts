import { Board, Position, BOARD_SIZE } from './types';

export type AIMode = 'hunt' | 'target';

export interface AIState {
  mode: AIMode;
  previousShots: Set<string>;
  targetQueue: Position[];
  lastHit: Position | null;
  currentDirection: 'north' | 'south' | 'east' | 'west' | null;
  originalHit: Position | null;
}

export const createInitialAIState = (): AIState => ({
  mode: 'hunt',
  previousShots: new Set(),
  targetQueue: [],
  lastHit: null,
  currentDirection: null,
  originalHit: null,
});

export const positionToString = (pos: Position): string => `${pos.row},${pos.col}`;

export const stringToPosition = (str: string): Position => {
  const [row, col] = str.split(',').map(Number);
  return { row, col };
};

export const getAdjacentPositions = (pos: Position): Position[] => {
  const adjacent: Position[] = [];
  
  // North
  if (pos.row > 0) {
    adjacent.push({ row: pos.row - 1, col: pos.col });
  }
  // South
  if (pos.row < BOARD_SIZE - 1) {
    adjacent.push({ row: pos.row + 1, col: pos.col });
  }
  // East
  if (pos.col < BOARD_SIZE - 1) {
    adjacent.push({ row: pos.row, col: pos.col + 1 });
  }
  // West
  if (pos.col > 0) {
    adjacent.push({ row: pos.row, col: pos.col - 1 });
  }
  
  return adjacent;
};

export const getDirectionalPosition = (pos: Position, direction: 'north' | 'south' | 'east' | 'west'): Position | null => {
  switch (direction) {
    case 'north':
      return pos.row > 0 ? { row: pos.row - 1, col: pos.col } : null;
    case 'south':
      return pos.row < BOARD_SIZE - 1 ? { row: pos.row + 1, col: pos.col } : null;
    case 'east':
      return pos.col < BOARD_SIZE - 1 ? { row: pos.row, col: pos.col + 1 } : null;
    case 'west':
      return pos.col > 0 ? { row: pos.row, col: pos.col - 1 } : null;
  }
};

export const getRandomValidShot = (board: Board, previousShots: Set<string>): Position => {
  const availablePositions: Position[] = [];
  
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const posStr = positionToString({ row, col });
      if (!previousShots.has(posStr)) {
        availablePositions.push({ row, col });
      }
    }
  }
  
  if (availablePositions.length === 0) {
    throw new Error('No available positions to shoot');
  }
  
  return availablePositions[Math.floor(Math.random() * availablePositions.length)];
};

export const aiTakeTurn = (board: Board, aiState: AIState): { newBoard: Board; newAIState: AIState } => {
  let targetPosition: Position;
  let newAIState = { ...aiState, previousShots: new Set(aiState.previousShots) };
  
  if (newAIState.mode === 'hunt') {
    // Hunt mode: random valid position
    targetPosition = getRandomValidShot(board, newAIState.previousShots);
  } else {
    // Target mode: use target queue or continue in current direction
    if (newAIState.targetQueue.length > 0) {
      targetPosition = newAIState.targetQueue.shift()!;
    } else if (newAIState.currentDirection && newAIState.lastHit) {
      // Continue in current direction
      const nextPos = getDirectionalPosition(newAIState.lastHit, newAIState.currentDirection);
      if (nextPos && !newAIState.previousShots.has(positionToString(nextPos))) {
        targetPosition = nextPos;
      } else {
        // Can't continue in this direction, try opposite
        const opposite = getOppositeDirection(newAIState.currentDirection);
        newAIState.currentDirection = opposite;
        const oppositePos = getDirectionalPosition(newAIState.originalHit!, opposite);
        if (oppositePos && !newAIState.previousShots.has(positionToString(oppositePos))) {
          targetPosition = oppositePos;
        } else {
          // Fall back to hunt mode
          newAIState.mode = 'hunt';
          targetPosition = getRandomValidShot(board, newAIState.previousShots);
        }
      }
    } else {
      // No valid target, fall back to hunt mode
      newAIState.mode = 'hunt';
      targetPosition = getRandomValidShot(board, newAIState.previousShots);
    }
  }
  
  // Record the shot
  newAIState.previousShots.add(positionToString(targetPosition));
  
  // Perform the attack
  const newBoard = { ...board, cells: board.cells.map(row => [...row]), ships: board.ships.map(ship => ({ ...ship })) };
  const cell = newBoard.cells[targetPosition.row][targetPosition.col];
  
  if (cell.state === 'ship') {
    // Hit!
    cell.state = 'hit';
    const ship = newBoard.ships.find(s => s.id === cell.shipId);
    if (ship) {
      ship.hits += 1;
      if (ship.hits >= ship.size) {
        ship.isSunk = true;
        // Ship sunk, return to hunt mode
        newAIState.mode = 'hunt';
        newAIState.targetQueue = [];
        newAIState.lastHit = null;
        newAIState.currentDirection = null;
        newAIState.originalHit = null;
      } else {
        // Ship hit but not sunk
        if (newAIState.mode === 'hunt') {
          // First hit on a ship, switch to target mode
          newAIState.mode = 'target';
          newAIState.lastHit = targetPosition;
          newAIState.originalHit = targetPosition;
          
          // Add adjacent positions to target queue
          const adjacent = getAdjacentPositions(targetPosition);
          const validAdjacent = adjacent.filter(pos => 
            !newAIState.previousShots.has(positionToString(pos))
          );
          newAIState.targetQueue = validAdjacent;
          
          // Set a random direction to try first
          if (validAdjacent.length > 0) {
            newAIState.currentDirection = getDirectionFromPositions(targetPosition, validAdjacent[0]);
          }
        } else {
          // Continuing to target
          newAIState.lastHit = targetPosition;
          
          // If this is the second hit in a direction, keep going
          if (newAIState.currentDirection) {
            const nextPos = getDirectionalPosition(targetPosition, newAIState.currentDirection);
            if (nextPos && !newAIState.previousShots.has(positionToString(nextPos))) {
              newAIState.targetQueue = [nextPos];
            } else {
              // Try other directions
              const adjacent = getAdjacentPositions(targetPosition);
              const validAdjacent = adjacent.filter(pos => 
                !newAIState.previousShots.has(positionToString(pos))
              );
              newAIState.targetQueue = validAdjacent;
            }
          }
        }
      }
    }
  } else {
    // Miss
    cell.state = 'miss';
    
    if (newAIState.mode === 'target') {
      // If we missed while targeting, try another direction
      if (newAIState.currentDirection && newAIState.targetQueue.length === 0) {
        const opposite = getOppositeDirection(newAIState.currentDirection);
        newAIState.currentDirection = opposite;
        const oppositePos = getDirectionalPosition(newAIState.originalHit!, opposite);
        if (oppositePos && !newAIState.previousShots.has(positionToString(oppositePos))) {
          newAIState.targetQueue = [oppositePos];
        } else {
          // Try remaining adjacent positions
          const adjacent = getAdjacentPositions(newAIState.originalHit!);
          const validAdjacent = adjacent.filter(pos => 
            !newAIState.previousShots.has(positionToString(pos))
          );
          newAIState.targetQueue = validAdjacent;
          
          if (validAdjacent.length === 0) {
            // No more options, return to hunt
            newAIState.mode = 'hunt';
            newAIState.lastHit = null;
            newAIState.currentDirection = null;
            newAIState.originalHit = null;
          }
        }
      }
    }
  }
  
  return { newBoard, newAIState };
};

const getOppositeDirection = (direction: 'north' | 'south' | 'east' | 'west'): 'north' | 'south' | 'east' | 'west' => {
  switch (direction) {
    case 'north': return 'south';
    case 'south': return 'north';
    case 'east': return 'west';
    case 'west': return 'east';
  }
};

const getDirectionFromPositions = (from: Position, to: Position): 'north' | 'south' | 'east' | 'west' => {
  if (to.row < from.row) return 'north';
  if (to.row > from.row) return 'south';
  if (to.col > from.col) return 'east';
  return 'west';
};