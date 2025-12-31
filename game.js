const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const dragBar = document.getElementById('drag-bar');
const statusEl = document.getElementById('status');
const levelEl = document.getElementById('level');
const messageOverlay = document.getElementById('message-overlay');
const messageText = document.getElementById('message-text');
const messageBtn = document.getElementById('message-btn');

// Game constants
const BALL_RADIUS = 20;
const USER_BALL_RADIUS = 15;
const GOAL_RADIUS = 30;
const FRICTION = 0.98;
const MIN_VELOCITY = 5;
const MAX_SHOT_POWER = 800;
const ENEMY_BASE_SPEED = 100;
const ENEMY_SPEED_INCREASE = 0.5;
const ENEMY_MAX_CHASE_TIME = 3000;

// Game state
let currentLevel = 1;
let targetBall = { x: 100, y: 300, vx: 0, vy: 0 };
let userBall = { x: 150, y: 350, vx: 0, vy: 0 };
let goal = { x: 700, y: 300 };
let obstacles = [];
let enemies = [];
let zones = [];

let isAiming = false;
let aimStart = { x: 0, y: 0 };
let mousePos = { x: 0, y: 0 };
let lastTime = 0;
let gameRunning = true;

// Level definitions
const levels = {
    1: {
        targetBall: { x: 150, y: 300 },
        goal: { x: 700, y: 300 },
        obstacles: [
            { x: 300, y: 200, width: 40, height: 200, vx: 0, vy: 100 },
            { x: 500, y: 400, width: 40, height: 200, vx: 0, vy: -120 }
        ],
        enemies: [],
        zones: []
    },
    2: {
        targetBall: { x: 150, y: 300 },
        goal: { x: 700, y: 300 },
        obstacles: [
            { x: 250, y: 150, width: 30, height: 150, vx: 0, vy: 80 },
            { x: 450, y: 350, width: 30, height: 150, vx: 0, vy: -90 }
        ],
        enemies: [
            { x: 400, y: 100, radius: 18 }
        ],
        zones: []
    },
    3: {
        targetBall: { x: 150, y: 300 },
        goal: { x: 700, y: 300 },
        obstacles: [
            { x: 300, y: 100, width: 25, height: 120, vx: 0, vy: 70 }
        ],
        enemies: [
            { x: 350, y: 100, radius: 18 },
            { x: 500, y: 500, radius: 18 }
        ],
        zones: [
            { x: 200, y: 200, width: 150, height: 200, speedMod: 0.5, color: 'rgba(100, 100, 255, 0.3)' },
            { x: 500, y: 250, width: 120, height: 150, speedMod: 1.5, color: 'rgba(255, 200, 100, 0.3)' }
        ]
    }
};

function spawnUserBallNearTarget() {
    const angle = Math.random() * Math.PI * 2;
    const distance = BALL_RADIUS + USER_BALL_RADIUS + 30 + Math.random() * 50;
    userBall.x = targetBall.x + Math.cos(angle) * distance;
    userBall.y = targetBall.y + Math.sin(angle) * distance;
    userBall.vx = 0;
    userBall.vy = 0;
    
    // Keep in bounds
    userBall.x = Math.max(USER_BALL_RADIUS, Math.min(canvas.width - USER_BALL_RADIUS, userBall.x));
    userBall.y = Math.max(USER_BALL_RADIUS, Math.min(canvas.height - USER_BALL_RADIUS, userBall.y));
}


function loadLevel(levelNum) {
    const level = levels[levelNum];
    targetBall = { ...level.targetBall, vx: 0, vy: 0 };
    goal = { ...level.goal };
    obstacles = level.obstacles.map(o => ({ 
        ...o, 
        originalY: o.y,
        direction: 1 
    }));
    enemies = level.enemies.map(e => ({ 
        ...e, 
        state: 'idle',
        chaseTime: 0,
        wanderAngle: Math.random() * Math.PI * 2,
        wanderTimer: 0
    }));
    zones = [...level.zones];
    
    spawnUserBallNearTarget();
    isAiming = false;
    gameRunning = true;
    levelEl.textContent = levelNum;
    updateStatus();
}

function ballsAreStable() {
    const targetSpeed = Math.hypot(targetBall.vx, targetBall.vy);
    const userSpeed = Math.hypot(userBall.vx, userBall.vy);
    return targetSpeed < MIN_VELOCITY && userSpeed < MIN_VELOCITY;
}

function targetBallIsMoving() {
    return Math.hypot(targetBall.vx, targetBall.vy) >= MIN_VELOCITY;
}

function updateStatus() {
    if (isAiming) {
        statusEl.textContent = 'Release to shoot!';
    } else if (!ballsAreStable()) {
        statusEl.textContent = 'Wait for balls to stop...';
    } else {
        statusEl.textContent = 'Click and drag the blue ball to aim!';
    }
}

function showMessage(text, btnText = 'Continue') {
    messageText.textContent = text;
    messageBtn.textContent = btnText;
    messageOverlay.classList.remove('hidden');
    gameRunning = false;
}

function hideMessage() {
    messageOverlay.classList.add('hidden');
    gameRunning = true;
}

// Input handling
canvas.addEventListener('mousedown', (e) => {
    if (!gameRunning) return;
    if (!ballsAreStable()) return;
    
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    // Check if clicking on user ball (expanded click area for edge cases)
    const dist = Math.hypot(mx - userBall.x, my - userBall.y);
    if (dist <= USER_BALL_RADIUS + 15) {
        isAiming = true;
        aimStart = { x: userBall.x, y: userBall.y }; // Start from ball center
        mousePos = { x: mx, y: my };
        updateStatus();
    }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mousePos = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
});

// Track mouse even outside canvas while aiming
document.addEventListener('mousemove', (e) => {
    if (isAiming) {
        const rect = canvas.getBoundingClientRect();
        mousePos = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
});

// Allow releasing mouse outside canvas
document.addEventListener('mouseup', () => {
    if (isAiming) {
        const dx = userBall.x - mousePos.x;
        const dy = userBall.y - mousePos.y;
        const rawPower = Math.hypot(dx, dy) * 5;
        const power = Math.min(rawPower, MAX_SHOT_POWER);
        
        if (power > 20) {
            const angle = Math.atan2(dy, dx);
            userBall.vx = Math.cos(angle) * power;
            userBall.vy = Math.sin(angle) * power;
        }
        
        isAiming = false;
        updateStatus();
    }
});

canvas.addEventListener('mouseleave', () => {
    // Don't cancel aiming when mouse leaves canvas - allow dragging outside
});

messageBtn.addEventListener('click', () => {
    hideMessage();
    if (messageBtn.textContent === 'Next Level') {
        currentLevel++;
        if (currentLevel > 3) {
            currentLevel = 1;
            showMessage('You Win! All levels complete!', 'Play Again');
        } else {
            loadLevel(currentLevel);
        }
    } else if (messageBtn.textContent === 'Retry') {
        loadLevel(currentLevel);
    } else if (messageBtn.textContent === 'Play Again') {
        loadLevel(currentLevel);
    }
});


function getSpeedModifier(x, y) {
    for (const zone of zones) {
        if (x >= zone.x && x <= zone.x + zone.width &&
            y >= zone.y && y <= zone.y + zone.height) {
            return zone.speedMod;
        }
    }
    return 1;
}

function applyFriction(ball, dt) {
    const speedMod = getSpeedModifier(ball.x, ball.y);
    const frictionMod = speedMod < 1 ? 0.95 : (speedMod > 1 ? 0.99 : FRICTION);
    ball.vx *= Math.pow(frictionMod, dt * 60);
    ball.vy *= Math.pow(frictionMod, dt * 60);
    
    // Stop if very slow
    if (Math.hypot(ball.vx, ball.vy) < MIN_VELOCITY) {
        ball.vx = 0;
        ball.vy = 0;
    }
}

function ballBallCollision(b1, r1, b2, r2) {
    const dx = b2.x - b1.x;
    const dy = b2.y - b1.y;
    const dist = Math.hypot(dx, dy);
    
    if (dist < r1 + r2 && dist > 0) {
        // Normalize collision vector
        const nx = dx / dist;
        const ny = dy / dist;
        
        // Relative velocity
        const dvx = b1.vx - b2.vx;
        const dvy = b1.vy - b2.vy;
        
        // Relative velocity along collision normal
        const dvn = dvx * nx + dvy * ny;
        
        // Only resolve if balls are approaching
        if (dvn > 0) {
            // Update velocities (equal mass)
            b1.vx -= dvn * nx;
            b1.vy -= dvn * ny;
            b2.vx += dvn * nx;
            b2.vy += dvn * ny;
        }
        
        // Separate balls
        const overlap = (r1 + r2 - dist) / 2;
        b1.x -= overlap * nx;
        b1.y -= overlap * ny;
        b2.x += overlap * nx;
        b2.y += overlap * ny;
        
        return true;
    }
    return false;
}

function ballWallCollision(ball, radius) {
    if (ball.x - radius < 0) {
        ball.x = radius;
        ball.vx = Math.abs(ball.vx) * 0.8;
    }
    if (ball.x + radius > canvas.width) {
        ball.x = canvas.width - radius;
        ball.vx = -Math.abs(ball.vx) * 0.8;
    }
    if (ball.y - radius < 0) {
        ball.y = radius;
        ball.vy = Math.abs(ball.vy) * 0.8;
    }
    if (ball.y + radius > canvas.height) {
        ball.y = canvas.height - radius;
        ball.vy = -Math.abs(ball.vy) * 0.8;
    }
}

function ballObstacleCollision(ball, radius, obs) {
    // Find closest point on rectangle
    const closestX = Math.max(obs.x, Math.min(ball.x, obs.x + obs.width));
    const closestY = Math.max(obs.y, Math.min(ball.y, obs.y + obs.height));
    
    const dx = ball.x - closestX;
    const dy = ball.y - closestY;
    const dist = Math.hypot(dx, dy);
    
    if (dist < radius && dist > 0) {
        // Normalize
        const nx = dx / dist;
        const ny = dy / dist;
        
        // Reflect velocity
        const dot = ball.vx * nx + ball.vy * ny;
        ball.vx = (ball.vx - 2 * dot * nx) * 0.8;
        ball.vy = (ball.vy - 2 * dot * ny) * 0.8;
        
        // Separate
        ball.x = closestX + nx * radius;
        ball.y = closestY + ny * radius;
        
        return true;
    }
    return false;
}

function ballEnemyCollision(ball, radius, enemy) {
    const dx = ball.x - enemy.x;
    const dy = ball.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    
    if (dist < radius + enemy.radius && dist > 0) {
        const nx = dx / dist;
        const ny = dy / dist;
        
        // Reflect velocity
        const dot = ball.vx * nx + ball.vy * ny;
        ball.vx = (ball.vx - 2 * dot * nx) * 0.8;
        ball.vy = (ball.vy - 2 * dot * ny) * 0.8;
        
        // Separate
        ball.x = enemy.x + nx * (radius + enemy.radius);
        ball.y = enemy.y + ny * (radius + enemy.radius);
        
        return true;
    }
    return false;
}


function update(deltaTime) {
    if (!gameRunning) return;
    
    const dt = deltaTime / 1000;
    
    // Update ball positions
    targetBall.x += targetBall.vx * dt;
    targetBall.y += targetBall.vy * dt;
    userBall.x += userBall.vx * dt;
    userBall.y += userBall.vy * dt;
    
    // Apply friction
    applyFriction(targetBall, dt);
    applyFriction(userBall, dt);
    
    // Ball-ball collision
    ballBallCollision(userBall, USER_BALL_RADIUS, targetBall, BALL_RADIUS);
    
    // Wall collisions
    ballWallCollision(targetBall, BALL_RADIUS);
    ballWallCollision(userBall, USER_BALL_RADIUS);
    
    // Update obstacles
    obstacles.forEach(obs => {
        obs.y += obs.vy * dt * obs.direction;
        if (obs.y < 50 || obs.y + obs.height > canvas.height - 20) {
            obs.direction *= -1;
        }
    });
    
    // Obstacle collisions
    obstacles.forEach(obs => {
        ballObstacleCollision(userBall, USER_BALL_RADIUS, obs);
        
        // Target ball hitting obstacle while moving = game over
        if (targetBallIsMoving()) {
            if (ballObstacleCollision(targetBall, BALL_RADIUS, obs)) {
                showMessage('Game Over! Target hit obstacle.', 'Retry');
                return;
            }
        }
    });
    
    // Update enemies based on user aiming (not target ball movement)
    enemies.forEach(enemy => {
        if (isAiming) {
            if (enemy.state !== 'chasing') {
                enemy.state = 'chasing';
                enemy.chaseTime = 0;
            }
            enemy.chaseTime += deltaTime;
            const speedMultiplier = 1 + (ENEMY_SPEED_INCREASE * Math.min(enemy.chaseTime, ENEMY_MAX_CHASE_TIME) / 1000);
            const speed = ENEMY_BASE_SPEED * speedMultiplier * dt;
            
            const dx = targetBall.x - enemy.x;
            const dy = targetBall.y - enemy.y;
            const dist = Math.hypot(dx, dy);
            
            if (dist > 0) {
                enemy.x += (dx / dist) * speed;
                enemy.y += (dy / dist) * speed;
            }
        } else {
            enemy.state = 'idle';
            enemy.chaseTime = 0;
            
            // Idle wandering
            enemy.wanderTimer += deltaTime;
            if (enemy.wanderTimer > 1500) {
                enemy.wanderAngle = Math.random() * Math.PI * 2;
                enemy.wanderTimer = 0;
            }
            
            const wanderSpeed = 30 * dt;
            enemy.x += Math.cos(enemy.wanderAngle) * wanderSpeed;
            enemy.y += Math.sin(enemy.wanderAngle) * wanderSpeed;
            
            if (enemy.x < enemy.radius || enemy.x > canvas.width - enemy.radius) {
                enemy.wanderAngle = Math.PI - enemy.wanderAngle;
            }
            if (enemy.y < enemy.radius || enemy.y > canvas.height - enemy.radius) {
                enemy.wanderAngle = -enemy.wanderAngle;
            }
            enemy.x = Math.max(enemy.radius, Math.min(canvas.width - enemy.radius, enemy.x));
            enemy.y = Math.max(enemy.radius, Math.min(canvas.height - enemy.radius, enemy.y));
        }
        
        // User ball bounces off enemies
        ballEnemyCollision(userBall, USER_BALL_RADIUS, enemy);
        
        // Target ball hitting enemy while moving = game over
        if (targetBallIsMoving()) {
            const dist = Math.hypot(targetBall.x - enemy.x, targetBall.y - enemy.y);
            if (dist < BALL_RADIUS + enemy.radius) {
                showMessage('Game Over! Caught by enemy.', 'Retry');
                return;
            }
        }
    });
    
    // Check goal
    const goalDist = Math.hypot(targetBall.x - goal.x, targetBall.y - goal.y);
    if (goalDist < BALL_RADIUS + GOAL_RADIUS) {
        showMessage('Level Complete!', 'Next Level');
        return;
    }
    
    updateStatus();
}

// Debug: Skip level with 'N' key
document.addEventListener('keydown', (e) => {
    if (e.key === 'n' || e.key === 'N') {
        currentLevel++;
        if (currentLevel > 3) {
            currentLevel = 1;
        }
        loadLevel(currentLevel);
    }
});


function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw zones
    zones.forEach(zone => {
        ctx.fillStyle = zone.color;
        ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        const label = zone.speedMod < 1 ? 'SLOW' : 'FAST';
        ctx.fillText(label, zone.x + zone.width/2, zone.y + zone.height/2);
    });
    
    // Draw goal
    ctx.beginPath();
    ctx.arc(goal.x, goal.y, GOAL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#4ecca3';
    ctx.fill();
    ctx.strokeStyle = '#45b393';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(goal.x, goal.y, GOAL_RADIUS - 10, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw obstacles
    obstacles.forEach(obs => {
        ctx.fillStyle = '#e94560';
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        ctx.strokeStyle = '#c73e54';
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
    });
    
    // Draw enemies
    enemies.forEach(enemy => {
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fillStyle = enemy.state === 'chasing' ? '#ff6b6b' : '#a55';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        const eyeOffset = 5;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(enemy.x - eyeOffset, enemy.y - 3, 4, 0, Math.PI * 2);
        ctx.arc(enemy.x + eyeOffset, enemy.y - 3, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(enemy.x - eyeOffset, enemy.y - 3, 2, 0, Math.PI * 2);
        ctx.arc(enemy.x + eyeOffset, enemy.y - 3, 2, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // Draw target ball (white)
    ctx.beginPath();
    ctx.arc(targetBall.x, targetBall.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(targetBall.x - 5, targetBall.y - 5, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fill();
    
    // Draw user ball (blue)
    ctx.beginPath();
    ctx.arc(userBall.x, userBall.y, USER_BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#4a9eff';
    ctx.fill();
    ctx.strokeStyle = '#2a7edf';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(userBall.x - 3, userBall.y - 3, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fill();
    
    // Draw aim line
    if (isAiming) {
        const dx = userBall.x - mousePos.x;
        const dy = userBall.y - mousePos.y;
        const rawPower = Math.hypot(dx, dy) * 5;
        const power = Math.min(rawPower, MAX_SHOT_POWER);
        const powerRatio = power / MAX_SHOT_POWER;
        const angle = Math.atan2(dy, dx);
        
        // Draw pull-back line (from ball to mouse)
        ctx.beginPath();
        ctx.moveTo(userBall.x, userBall.y);
        ctx.lineTo(mousePos.x, mousePos.y);
        ctx.strokeStyle = 'rgba(150, 150, 150, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw power indicator line (direction ball will go)
        const lineLength = power / 5;
        ctx.beginPath();
        ctx.moveTo(userBall.x, userBall.y);
        ctx.lineTo(
            userBall.x + Math.cos(angle) * lineLength,
            userBall.y + Math.sin(angle) * lineLength
        );
        
        // Color based on power (green -> yellow -> red)
        let color;
        if (powerRatio < 0.5) {
            color = `rgb(${Math.floor(powerRatio * 2 * 255)}, 255, 100)`;
        } else {
            color = `rgb(255, ${Math.floor((1 - (powerRatio - 0.5) * 2) * 255)}, 100)`;
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // Draw arrow head
        const arrowLen = 15;
        const arrowX = userBall.x + Math.cos(angle) * lineLength;
        const arrowY = userBall.y + Math.sin(angle) * lineLength;
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(
            arrowX - Math.cos(angle - 0.4) * arrowLen,
            arrowY - Math.sin(angle - 0.4) * arrowLen
        );
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(
            arrowX - Math.cos(angle + 0.4) * arrowLen,
            arrowY - Math.sin(angle + 0.4) * arrowLen
        );
        ctx.stroke();
        
        // Draw power bar
        const barWidth = 60;
        const barHeight = 8;
        const barX = userBall.x - barWidth / 2;
        const barY = userBall.y - USER_BALL_RADIUS - 20;
        
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);
        
        // Power fill
        ctx.fillStyle = color;
        ctx.fillRect(barX, barY, barWidth * powerRatio, barHeight);
        
        // Border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
        
        // "MAX" indicator if at max power
        if (rawPower >= MAX_SHOT_POWER) {
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('MAX', userBall.x, barY - 5);
        }
    }
}

function gameLoop(timestamp) {
    const deltaTime = Math.min(timestamp - lastTime, 50); // Cap delta time
    lastTime = timestamp;
    
    update(deltaTime);
    draw();
    
    requestAnimationFrame(gameLoop);
}

// Hide drag bar (not needed anymore)
dragBar.parentElement.style.display = 'none';

// Start game
loadLevel(1);
requestAnimationFrame((timestamp) => {
    lastTime = timestamp;
    gameLoop(timestamp);
});
