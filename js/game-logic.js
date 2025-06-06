// js/game-logic.js
export const BOARD_SIZE = 8;
export const PLAYER1 = 'red';
export const PLAYER2 = 'black';
export const EMPTY = null;

export function createInitialBoard() {
    const board = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        board[r] = [];
        for (let c = 0; c < BOARD_SIZE; c++) {
            if ((r + c) % 2 !== 0) { 
                if (r < 3) board[r][c] = { player: PLAYER2, isKing: false }; 
                else if (r > 4) board[r][c] = { player: PLAYER1, isKing: false }; 
                else board[r][c] = EMPTY;
            } else {
                board[r][c] = EMPTY; 
            }
        }
    }
    return board;
}

export function isValidSquare(r, c) {
    return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

export function getValidMovesForPiece(r, c, piecePlayer, isKing, boardState) {
    const moves = [];
    const opponent = piecePlayer === PLAYER1 ? PLAYER2 : PLAYER1;

    if (isKing) { 
        const directions = [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }];
        for (const dir of directions) {
            for (let i = 1; i < BOARD_SIZE; i++) {
                const nextR = r + dir.dr * i;
                const nextC = c + dir.dc * i;

                if (!isValidSquare(nextR, nextC)) break; 

                if (boardState[nextR] && boardState[nextR][nextC] !== EMPTY) {
                    if (boardState[nextR][nextC].player === opponent) {
                        const landR = nextR + dir.dr;
                        const landC = nextC + dir.dc;
                        if (isValidSquare(landR, landC) && boardState[landR] && boardState[landR][landC] === EMPTY) {
                            moves.push({ to: { row: landR, col: landC }, jumpedPieces: [{ row: nextR, col: nextC }] });
                        }
                    }
                    break; 
                }
                moves.push({ to: { row: nextR, col: nextC }, jumpedPieces: [] });
            }
        }
    } else { 
        const captureDirections = [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }]; 
        const moveDirections = piecePlayer === PLAYER1 ? [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }] : [{ dr: 1, dc: -1 }, { dr: 1, dc: 1 }];

        for (const dir of moveDirections) {
            const nextR = r + dir.dr;
            const nextC = c + dir.dc;
            if (isValidSquare(nextR, nextC) && boardState[nextR] && boardState[nextR][nextC] === EMPTY) {
                moves.push({ to: { row: nextR, col: nextC }, jumpedPieces: [] });
            }
        }
        for (const dir of captureDirections) {
            const opponentR = r + dir.dr;
            const opponentC = c + dir.dc;
            const landR = r + dir.dr * 2;
            const landC = c + dir.dc * 2;

            if (isValidSquare(landR, landC) && boardState[landR] && boardState[landR][landC] === EMPTY &&
                isValidSquare(opponentR, opponentC) && boardState[opponentR] && boardState[opponentR][opponentC] &&
                boardState[opponentR][opponentC].player === opponent) {
                moves.push({ to: { row: landR, col: landC }, jumpedPieces: [{ row: opponentR, col: opponentC }] });
            }
        }
    }
    return moves;
}

export function findAllObligatoryCaptures(player, boardState) {
    const allCaptures = [];
    if (!boardState || boardState.length === 0) return allCaptures;

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = boardState[r] ? boardState[r][c] : null;
            if (piece && piece.player === player) {
                const pieceMoves = getValidMovesForPiece(r, c, piece.player, piece.isKing, boardState);
                const pieceCaptures = pieceMoves.filter(m => m.jumpedPieces.length > 0);
                if (pieceCaptures.length > 0) {
                    allCaptures.push({ piecePos: { row: r, col: c }, captures: pieceCaptures });
                }
            }
        }
    }
    return allCaptures;
}

export function checkWinCondition(boardState, playerWhoseTurnItIs) {
    let p1Pieces = 0, p2Pieces = 0;
    let p1CanMove = false, p2CanMove = false;

    if (!boardState || boardState.length === 0) return null;

    const p1Obligatory = findAllObligatoryCaptures(PLAYER1, boardState);
    const p2Obligatory = findAllObligatoryCaptures(PLAYER2, boardState);

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = boardState[r] ? boardState[r][c] : null;
            if (piece) {
                if (piece.player === PLAYER1) {
                    p1Pieces++;
                    if (!p1CanMove) { 
                        if (p1Obligatory.some(oc => oc.piecePos.row === r && oc.piecePos.col === c && oc.captures.length > 0)) {
                            p1CanMove = true;
                        } else if (p1Obligatory.length === 0 && getValidMovesForPiece(r, c, PLAYER1, piece.isKing, boardState).filter(m => m.jumpedPieces.length === 0).length > 0) {
                            p1CanMove = true;
                        }
                    }
                } else { 
                    p2Pieces++;
                    if (!p2CanMove) {
                         if (p2Obligatory.some(oc => oc.piecePos.row === r && oc.piecePos.col === c && oc.captures.length > 0)) {
                            p2CanMove = true;
                        } else if (p2Obligatory.length === 0 && getValidMovesForPiece(r, c, PLAYER2, piece.isKing, boardState).filter(m => m.jumpedPieces.length === 0).length > 0) {
                            p2CanMove = true;
                        }
                    }
                }
            }
        }
    }

    if (p1Pieces === 0) return PLAYER2; 
    if (p2Pieces === 0) return PLAYER1; 

    if (playerWhoseTurnItIs === PLAYER1 && !p1CanMove) return PLAYER2;
    if (playerWhoseTurnItIs === PLAYER2 && !p2CanMove) return PLAYER1;
    
    return null; 
}
