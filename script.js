// 常數設定
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;

// DOM 元素
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('nextCanvas');
const nextCtx = nextCanvas.getContext('2d');

const scoreElement = document.getElementById('score');
const levelElement = document.getElementById('level');
const linesElement = document.getElementById('lines');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreElement = document.getElementById('finalScore');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const soundBtn = document.getElementById('soundBtn');

// 縮放畫布
ctx.scale(BLOCK_SIZE, BLOCK_SIZE);
// nextCanvas 每個 block 也是 30px，因為 4x4 就是 120x120
nextCtx.scale(BLOCK_SIZE, BLOCK_SIZE);

// 方塊形狀定義
const SHAPES = [
    [], // 空
    [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], // I
    [[2, 0, 0], [2, 2, 2], [0, 0, 0]], // J
    [[0, 0, 3], [3, 3, 3], [0, 0, 0]], // L
    [[4, 4], [4, 4]], // O
    [[0, 5, 5], [5, 5, 0], [0, 0, 0]], // S
    [[0, 6, 0], [6, 6, 6], [0, 0, 0]], // T
    [[7, 7, 0], [0, 7, 7], [0, 0, 0]]  // Z
];

// 遊戲變數
let board = [];
let player = {
    pos: { x: 0, y: 0 },
    matrix: null
};
let nextPiece = null;
let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let score = 0;
let level = 1;
let lines = 0;
let isGameOver = false;
let isPlaying = false;
let animationId = null;

// 音效系統 (Web Audio API)
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let isSoundOn = true;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
}

function playSound(type) {
    if (!isSoundOn || !audioCtx) return;
    
    // 必須在使用者互動後才能播放
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.type = 'square'; // 8-bit 風格

    const now = audioCtx.currentTime;
    
    switch(type) {
        case 'move':
            osc.frequency.setValueAtTime(200, now);
            gainNode.gain.setValueAtTime(0.1, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
            break;
        case 'rotate':
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.linearRampToValueAtTime(400, now + 0.1);
            gainNode.gain.setValueAtTime(0.1, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;
        case 'drop':
            osc.frequency.setValueAtTime(150, now);
            gainNode.gain.setValueAtTime(0.1, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;
        case 'clear':
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.setValueAtTime(600, now + 0.1);
            gainNode.gain.setValueAtTime(0.1, now);
            gainNode.gain.linearRampToValueAtTime(0, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
            break;
        case 'gameover':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 1);
            gainNode.gain.setValueAtTime(0.2, now);
            gainNode.gain.linearRampToValueAtTime(0, now + 1);
            osc.start(now);
            osc.stop(now + 1);
            break;
    }
}

// 建立空盤面
function createMatrix(w, h) {
    const matrix = [];
    while (h--) {
        matrix.push(new Array(w).fill(0));
    }
    return matrix;
}

// 產生隨機方塊
function createPiece(type) {
    if (type === 0) type = 1; // 避免 0
    // 深拷貝
    return JSON.parse(JSON.stringify(SHAPES[type]));
}

function getRandomPiece() {
    const typeId = Math.floor(Math.random() * 7) + 1;
    return createPiece(typeId);
}

// 繪製方塊與盤面
function drawMatrix(matrix, offset, context) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                // 純黑白風格，方塊填滿黑色
                context.fillStyle = '#000';
                context.fillRect(x + offset.x, y + offset.y, 1, 1);
                
                // 畫一點邊框讓相鄰方塊有區別
                context.strokeStyle = '#fff';
                context.lineWidth = 0.05;
                context.strokeRect(x + offset.x, y + offset.y, 1, 1);
            }
        });
    });
}

function draw() {
    // 清除主畫布
    ctx.fillStyle = '#fff'; // 淺色背景
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawMatrix(board, { x: 0, y: 0 }, ctx);
    drawMatrix(player.matrix, player.pos, ctx);
}

function drawNext() {
    // 清除預覽畫布
    nextCtx.fillStyle = '#fff'; // 與背景同色或者透明
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    
    if (nextPiece) {
        // 計算置中
        const w = nextPiece[0].length;
        const h = nextPiece.length;
        const offsetX = (4 - w) / 2;
        const offsetY = (4 - h) / 2;
        drawMatrix(nextPiece, { x: offsetX, y: offsetY }, nextCtx);
    }
}

// 合併方塊到盤面
function merge(board, player) {
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                board[y + player.pos.y][x + player.pos.x] = value;
            }
        });
    });
}

// 碰撞偵測
function collide(board, player) {
    const m = player.matrix;
    const o = player.pos;
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 &&
                (board[y + o.y] && board[y + o.y][x + o.x]) !== 0) {
                return true;
            }
        }
    }
    return false;
}

// 旋轉矩陣
function rotate(matrix, dir) {
    // 轉置矩陣
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) {
            [
                matrix[x][y],
                matrix[y][x]
            ] = [
                matrix[y][x],
                matrix[x][y]
            ];
        }
    }
    // 反轉行
    if (dir > 0) {
        matrix.forEach(row => row.reverse());
    } else {
        matrix.reverse();
    }
}

// 玩家操作
function playerDrop() {
    player.pos.y++;
    if (collide(board, player)) {
        player.pos.y--;
        merge(board, player);
        playerReset();
        arenaSweep();
        updateScore();
    }
    dropCounter = 0;
}

function playerHardDrop() {
    while (!collide(board, player)) {
        player.pos.y++;
    }
    player.pos.y--;
    playSound('drop');
    merge(board, player);
    playerReset();
    arenaSweep();
    updateScore();
    dropCounter = 0;
}

function playerMove(offset) {
    player.pos.x += offset;
    if (collide(board, player)) {
        player.pos.x -= offset;
    } else {
        playSound('move');
    }
}

function playerRotate() {
    const pos = player.pos.x;
    let offset = 1;
    rotate(player.matrix, 1);
    
    // 處理靠牆旋轉的排斥
    while (collide(board, player)) {
        player.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > player.matrix[0].length) {
            // 旋轉失敗，轉回來
            rotate(player.matrix, -1);
            player.pos.x = pos;
            return;
        }
    }
    playSound('rotate');
}

// 重置當前方塊
function playerReset() {
    if (!nextPiece) {
        nextPiece = getRandomPiece();
    }
    player.matrix = nextPiece;
    nextPiece = getRandomPiece();
    player.pos.y = 0;
    player.pos.x = Math.floor(COLS / 2) - Math.floor(player.matrix[0].length / 2);
    
    drawNext();

    // 如果一出生就碰撞，遊戲結束
    if (collide(board, player)) {
        gameOver();
    }
}

// 消除滿行
function arenaSweep() {
    let rowCount = 0;
    outer: for (let y = board.length - 1; y >= 0; --y) {
        for (let x = 0; x < board[y].length; ++x) {
            if (board[y][x] === 0) {
                continue outer;
            }
        }
        
        // 找到滿行，清除並補上新的一行
        const row = board.splice(y, 1)[0].fill(0);
        board.unshift(row);
        ++y; // 因為陣列位移了，要重查目前這行
        rowCount++;
    }
    
    if (rowCount > 0) {
        playSound('clear');
        // 計分：1行=10, 2行=30, 3行=50, 4行=80
        const multipliers = [0, 10, 30, 50, 80];
        score += multipliers[rowCount] * level;
        lines += rowCount;
        
        // 升級邏輯：每10行升一級
        if (lines >= level * 10) {
            level++;
            // 速度提升
            dropInterval = Math.max(100, 1000 - (level - 1) * 100);
        }
    } else {
        playSound('drop');
    }
}

function updateScore() {
    scoreElement.innerText = score;
    levelElement.innerText = level;
    linesElement.innerText = lines;
}

function gameOver() {
    isGameOver = true;
    isPlaying = false;
    cancelAnimationFrame(animationId);
    playSound('gameover');
    finalScoreElement.innerText = score;
    gameOverScreen.classList.remove('hidden');
}

// 遊戲迴圈
function update(time = 0) {
    if (!isPlaying) return;
    
    const deltaTime = time - lastTime;
    lastTime = time;
    
    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
        playerDrop();
    }
    
    draw();
    animationId = requestAnimationFrame(update);
}

// 開始遊戲
function startGame() {
    initAudio(); // 初始化音效
    
    // 重置變數
    board = createMatrix(COLS, ROWS);
    score = 0;
    level = 1;
    lines = 0;
    dropInterval = 1000;
    isGameOver = false;
    isPlaying = true;
    
    updateScore();
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    
    nextPiece = null;
    playerReset();
    
    lastTime = performance.now();
    animationId = requestAnimationFrame(update);
}

// 事件監聽
document.addEventListener('keydown', event => {
    if (!isPlaying) {
        // 如果在開始或結束畫面，按 Enter 可以開始/重新開始
        if (event.key === 'Enter') {
            startGame();
        }
        return;
    }

    switch(event.key) {
        case 'ArrowLeft':
            playerMove(-1);
            break;
        case 'ArrowRight':
            playerMove(1);
            break;
        case 'ArrowDown':
            playerDrop();
            break;
        case 'ArrowUp':
            playerRotate();
            break;
        case ' ': // 空白鍵
            playerHardDrop();
            break;
    }
});

// UI 按鈕事件
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

soundBtn.addEventListener('click', () => {
    isSoundOn = !isSoundOn;
    soundBtn.innerText = `SOUND: ${isSoundOn ? 'ON' : 'OFF'}`;
});

// 初始畫一下空的板子
board = createMatrix(COLS, ROWS);
draw();
