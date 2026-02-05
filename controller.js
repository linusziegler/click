// activate live server and start kiosk mode using frefox --kiosk http://127.0.0.1:5500/
let outlineColor = null;
let fillColor = null;
let font;

const TIME_SECONDS = 30;
const GAME_INSTANCES = [];
const TOTAL_INSTANCES = 50;
const REWARD_PER_TASK = 0.016; // $0.016 = 1.6 cents
const ACCURACY_THRESHOLD = 80; // need 80% to get paid
const TIME_BONUS_REWARD = 0.005; // $0.005 = 0.5 cents
const TIME_BONUS_THRESHOLD = 5000; // need 5 seconds left to get bonus (in ms)

// Accuracy calculation weights (for weighted IoU)
const WEIGHT_FALSE_NEGATIVES = 1.0; // penalty for missing pixels from mask
const WEIGHT_FALSE_POSITIVES = .8; // penalty for extra pixels in polygon

// Level system
const IMAGES_PER_LEVEL = 7; // complete 7 images to advance one level
const MAX_LEVEL = 5;

// select random images for the instances
const randomOrder = getRandomNumbersFromRange(TOTAL_INSTANCES, TOTAL_INSTANCES);
for (let i = 0; i < TOTAL_INSTANCES; i++) {
    const imgIndex = randomOrder[i];
    const timer = Math.ceil(TIME_SECONDS - (i / TOTAL_INSTANCES) * 30); // decreasing time
    GAME_INSTANCES.push([`imgs/${imgIndex}.png`, `imgs/${imgIndex}_mask.png`, timer]);
}

const GLOBAL_TEXT_SIZE = 72; // global default text size

let currentInstanceIndex = 0;
let resultsLog = [];
let currentGameState = null;
let displayResultsTime = 0;
let isDisplayingResults = false;
let allInstancesComplete = false;
let finalResultsStartTime = null;
let successfulInstances = 0;

// leaderboard state
let playerId = '';
let leaderboard = [];
let totalMoneyEarned = 0;
let isGameStarted = false;
let playerLevel = 1;
let loadedCursorImage = null;
let levelIconImage = null;
let levelIconGreyedImage = null;

// level unlock screen state
let isDisplayingLevelUnlock = false;
let levelUnlockStartTime = 0;
let unlockedLevel = 0;
let moneyStackImage = null;

function setup() {
    // load font
    font = loadFont('fonts/DotGothic16-Regular.ttf');
    textFont(font);
    // display setup
    smooth();
    frameRate(60);
    let width = windowWidth;
    let height = windowHeight;
    createCanvas(width, height);

    // initialize colors
    outlineColor = color(0, 265, 65, 100);
    fillColor = color(0, 265, 65, 60);
    // load leaderboard from local storage
    loadLeaderboard();
    // generate random UID
    playerId = generateRandomUID();
    // load level icon images
    levelIconImage = loadImage('icon.png',
        () => { console.log('Level icon loaded'); },
        () => { console.log('Failed to load level icon'); levelIconImage = null; }
    );
    levelIconGreyedImage = loadImage('icon_greyed.png',
        () => { console.log('Level icon greyed loaded'); },
        () => { console.log('Failed to load level icon greyed'); levelIconGreyedImage = null; }
    );
    moneyStackImage = loadImage('moneystack.gif',
        () => { console.log('Money stack image loaded'); },
        () => { console.log('Failed to load money stack image'); moneyStackImage = null; }
    );

}

function draw() {
    background(0);
    
    if (isDisplayingLevelUnlock) {
        // show level unlock screen
        drawLevelUnlockScreen();
        const elapsedTime = millis() - levelUnlockStartTime;
        if (elapsedTime > 5000) {
            isDisplayingLevelUnlock = false;
            isDisplayingResults = true;
        }
    } else if (!isGameStarted) {
        // show start screen with UID and leaderboard
        drawStartScreen();
    } else if (allInstancesComplete) {
        // show final results screen
        drawFinalResultsScreen();
        if (finalResultsStartTime === null) {
            finalResultsStartTime = millis();
        }
        // check if 15 seconds have passed, then redirect
        const elapsedTime = millis() - finalResultsStartTime;
        // draw countdown to redirect
        const countdown = max(0, 15 - floor(elapsedTime / 1000));
        drawText(`Restarting in ${countdown}s`, windowWidth / 2, windowHeight - 100, 
            { size: 20, alignH: CENTER, alignV: TOP, col: color(200) });
        if (elapsedTime > 15000) {
            window.location.href = 'index.html';
        }
    } else if (isDisplayingResults) {
        // show instance result with option to continue or exit
        drawInstanceResultScreen();
    } else if (currentGameState) {
        currentGameState.draw();
        // draw HIT counter top-right
        drawHitCounter();
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

function mouseClicked() {
    if (isGameStarted && !isDisplayingResults && currentGameState) {
        currentGameState.mouseClicked();
    }
}

function keyPressed() {
    if (isDisplayingLevelUnlock) {
        // skip level unlock screen with Enter
        if (key === 'Enter' || key === ' ') {
            isDisplayingLevelUnlock = false;
        }
        return;
    }
    if (allInstancesComplete) {
        // on final screen, pressing enter redirects immediately
        if (key === 'Enter' || key === ' ') {
            window.location.href = 'index.html';
        }
        return;
    }
    if (!isGameStarted) {
        // start the game
        if (key === 'Enter' || key === ' ') {
            isGameStarted = true;
            initializeInstance(0);
        }
        return;
    }
    if (isDisplayingResults) {
        handleResultsScreenInput();
        return;
    }
    if (!isDisplayingResults && currentGameState) {
        currentGameState.keyPressed();
    }
}

// -------------------- start screen --------------------

function drawStartScreen() {
    push();
    const boxWidth = 700;
    const boxHeight = 450;
    const startX = (windowWidth - boxWidth) / 2;
    const startY = (windowHeight - boxHeight) / 2;

    fill(0);
    strokeWeight(3);
    // rect(startX, startY, boxWidth, boxHeight);

    // greeting
    drawText('Hello Worker ' + playerId, windowWidth / 2, 120, 
        { size: 48, alignH: CENTER, alignV: TOP, col: color(100, 255, 100) });
    // leaderboard
    drawLeaderboard(startX, startY + 120, boxWidth, 5);

    // current player info at bottom
    drawText(playerId, startX + 70, startY + boxHeight - 60, 
        { size: 20, alignH: LEFT, alignV: TOP, col: color(255, 100, 100) });
    drawText('$0.000', startX + boxWidth - 70, startY + boxHeight - 60, 
        { size: 20, alignH: RIGHT, alignV: TOP, col: color(255, 100, 100) });

    // start instruction
    drawText('Press ENTER to start earning', windowWidth / 2, startY + boxHeight + 40, 
        { size: 20, alignH: CENTER, alignV: TOP, col: color(200) });

    pop();
}

// -------------------- instance result screen --------------------

function drawInstanceResultScreen() {
    const accuracy = resultsLog[resultsLog.length - 1];
    const reward = accuracy >= ACCURACY_THRESHOLD ? REWARD_PER_TASK : 0;
    const earlyBonus = (accuracy >= ACCURACY_THRESHOLD && currentGameState) ? currentGameState.earlyCompletionBonus : 0;
    const totalReward = reward + earlyBonus;
    
    // calculate level progression based on successful instances
    const nextLevelAt = Math.ceil(successfulInstances / IMAGES_PER_LEVEL) * IMAGES_PER_LEVEL;
    const successesToNextLevel = nextLevelAt - successfulInstances;
    
    const boxWidth = 600;
    const boxHeight = 680;
    const startX = (windowWidth - boxWidth) / 2;
    const startY = (windowHeight - boxHeight) / 2;

    push();
    fill(0);
    stroke(255);
    strokeWeight(3);
    // rect(startX, startY, boxWidth, boxHeight);

    // title
    drawText(`Instance ${currentInstanceIndex + 1} Complete`, 
        windowWidth / 2, startY + 40, 
        { size: 36, alignH: CENTER, alignV: TOP, col: color(255) });

    // accuracy
    const accuracyColor = accuracy >= ACCURACY_THRESHOLD ? color(100, 255, 100) : color(255, 100, 100);
    drawText('Accuracy', startX + 50, startY + 120, 
        { size: 24, alignH: LEFT, alignV: TOP, col: color(255) });
    drawText(accuracy.toFixed(2) + '%', startX + boxWidth - 50, startY + 120, 
        { size: 24, alignH: RIGHT, alignV: TOP, col: accuracyColor });

    // base reward
    const rewardText = reward > 0 ? '$' + reward.toFixed(3) : 'No reward';
    const rewardColor = reward > 0 ? color(100, 255, 100) : color(255, 100, 100);
    drawText('Base Reward', startX + 50, startY + 180, 
        { size: 24, alignH: LEFT, alignV: TOP, col: color(255) });
    drawText(rewardText, startX + boxWidth - 50, startY + 180, 
        { size: 24, alignH: RIGHT, alignV: TOP, col: rewardColor });

    // early completion bonus (only shown if accuracy meets threshold)
    if (earlyBonus > 0) {
        const bonusText = '$' + earlyBonus.toFixed(3);
        drawText('Time Bonus', startX + 50, startY + 240, 
            { size: 24, alignH: LEFT, alignV: TOP, col: color(255) });
        drawText(bonusText, startX + boxWidth - 50, startY + 240, 
            { size: 24, alignH: RIGHT, alignV: TOP, col: color(100, 255, 100) });
    }

    // total earned this round
    drawText('Total', startX + 50, startY + 300, 
        { size: 24, alignH: LEFT, alignV: TOP, col: color(255) });
    drawText('$' + totalMoneyEarned.toFixed(3), startX + boxWidth - 50, startY + 300, 
        { size: 24, alignH: RIGHT, alignV: TOP, col: color(100, 255, 100) });

    // level info
    drawText('Level', startX + 50, startY + 360, 
        { size: 24, alignH: LEFT, alignV: TOP, col: color(255) });
    drawText(playerLevel + ' / ' + MAX_LEVEL, startX + boxWidth - 50, startY + 360, 
        { size: 24, alignH: RIGHT, alignV: TOP, col: color(255, 200, 100) });

    // progress to next level
    if (playerLevel < MAX_LEVEL) {
        if (successesToNextLevel === 0 && reward > 0) {
            drawText('Level Up!', startX + boxWidth / 2, startY + 410, 
                { size: 24, alignH: CENTER, alignV: TOP, col: color(100, 255, 100) });
        } else {
        drawText('To Next Level', startX + 50, startY + 410, 
            { size: 20, alignH: LEFT, alignV: TOP, col: color(200) });
        drawText(successesToNextLevel + ' images', startX + boxWidth - 50, startY + 410, 
            { size: 20, alignH: RIGHT, alignV: TOP, col: color(200) });
        }
    } else {
        drawText('Max Level Reached!', startX + 50, startY + 410, 
            { size: 20, alignH: LEFT, alignV: TOP, col: color(100, 255, 100) });
    }

    // buttons
    push();
    textAlign(CENTER, CENTER);
    
    // continue button
    stroke(100, 255, 100);
    strokeWeight(2);
    rect(startX + 50, startY + boxHeight - 60, 200, 60);
    drawText('Continue (ENTER)', startX + 150, startY + boxHeight - 30, 
        { size: 20, alignH: CENTER, alignV: CENTER, col: color(100, 255, 100) });
    
    // exit button
    fill(0);
    stroke(255);
    strokeWeight(2);
    rect(startX + boxWidth - 250, startY + boxHeight - 60, 200, 60);
    drawText('Exit & Claim (E)', startX + boxWidth - 150, startY + boxHeight - 30, 
        { size: 20, alignH: CENTER, alignV: CENTER, col: color(255) });
    
    pop();
    pop();
}

function handleResultsScreenInput() {
    if (key === 'Enter' || key === ' ') {
        // continue to next instance
        isDisplayingResults = false;
        currentInstanceIndex++;
        if (currentInstanceIndex < GAME_INSTANCES.length) {
            initializeInstance(currentInstanceIndex);
        } else {
            onAllInstancesComplete();
        }
    } else if (key === 'e' || key === 'E') {
        // exit and claim rewards
        if (currentGameState) {
            currentGameState = null;
        }
        onPlayerExit();
    }
}

// -------------------- final results screen --------------------

function drawFinalResultsScreen() {
    push();
    const boxWidth = 700;
    const boxHeight = 700;
    const startX = (windowWidth - boxWidth) / 2;
    const startY = (windowHeight - boxHeight) / 2;

    fill(0);
    strokeWeight(3);
    // rect(startX, startY, boxWidth, boxHeight);

    // title
    drawText('Game Complete!', windowWidth / 2, 120, 
        { size: 48, alignH: CENTER, alignV: TOP, col: color(100, 255, 100) });

    // player UID
    drawText(`Worker ID: ${playerId}`, windowWidth / 2, startY + 90, 
        { size: 28, alignH: CENTER, alignV: TOP, col: color(200) });

    // stats
    const avgAccuracy = resultsLog.reduce((a, b) => a + b, 0) / resultsLog.length;
    drawText(`Instances Completed: ${resultsLog.length}`, startX + 50, startY + 150, 
        { size: 22, alignH: LEFT, alignV: TOP, col: color(200) });
    drawText(`Average Accuracy: ${avgAccuracy.toFixed(2)}%`, startX + 50, startY + 200, 
        { size: 22, alignH: LEFT, alignV: TOP, col: color(200) });
    drawText(`Total Earned: $${totalMoneyEarned.toFixed(3)}`, startX + 50, startY + 250, 
        { size: 28, alignH: LEFT, alignV: TOP, col: color(100, 255, 100) });

    // leaderboard using the shared function
    drawLeaderboard(startX, startY + 320, boxWidth, 5);

    pop();
}

// -------------------- level unlock screen --------------------

function drawLevelUnlockScreen() {
    push();
    background(0);
    
    // title text
    drawText(`Level ${unlockedLevel} Unlocked!`, windowWidth / 2, 120, 
        { size: 84, alignH: CENTER, alignV: CENTER, col: color(100, 255, 100) });
    
    // draw money stacks (1 to unlockedLevel)
    if (moneyStackImage) {
        const stackSize = 300;
        const spacing = 0;
        const totalWidth = unlockedLevel * (stackSize + spacing) - spacing;
        const startX = (windowWidth - totalWidth) / 2;
        
        push();
        imageMode(CENTER);
        for (let i = 0; i < unlockedLevel; i++) {
            image(moneyStackImage, startX + i * (stackSize + spacing) + stackSize / 2, windowHeight / 2 + 100, stackSize, stackSize);
        }
        pop();
    }
    
    pop();
}

// -------------------- leaderboard management --------------------

function loadLeaderboard() {
    // try to load from localStorage
    const stored = localStorage.getItem('leaderboard');
    if (stored) {
        try {
            leaderboard = JSON.parse(stored);
            leaderboard.sort((a, b) => b.totalMoney - a.totalMoney);
        } catch (e) {
            console.log('Could not parse leaderboard:', e);
            leaderboard = [];
        }
    } else {
        leaderboard = [];
    }
}

function saveLeaderboard() {
    localStorage.setItem('leaderboard', JSON.stringify(leaderboard));
}

function addToLeaderboard(uid, accuracies, totalMoney) {
    const avgAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    // calculate level
    const level = Math.min(Math.floor(successfulInstances / IMAGES_PER_LEVEL) + 1, MAX_LEVEL);
    
    // add new entry, or append to existing if uid exists
    const existingIndex = leaderboard.findIndex(entry => entry.uid === uid);
    if (existingIndex !== -1) {
        // update existing entry
        const existingEntry = leaderboard[existingIndex];
        existingEntry.totalMoney += totalMoney;
        existingEntry.accuracies = existingEntry.accuracies.concat(accuracies);
        existingEntry.level = level;
        const newAvgAccuracy = existingEntry.accuracies.reduce((a, b) => a + b, 0) / existingEntry.accuracies.length;
        existingEntry.avgAccuracy = parseFloat(newAvgAccuracy.toFixed(2));
        existingEntry.timestamp = new Date().toLocaleString();
        leaderboard[existingIndex] = existingEntry;
    } else {
        // add new entry
        leaderboard.push({
            uid: uid,
            level: level,
            totalMoney: parseFloat(totalMoney.toFixed(3)),
            avgAccuracy: parseFloat(avgAccuracy.toFixed(2)),
            accuracies: accuracies.map(a => parseFloat(a.toFixed(2))),
            timestamp: new Date().toLocaleString()
        });
    }
    leaderboard.sort((a, b) => b.totalMoney - a.totalMoney);
    
    saveLeaderboard();
}

// -------------------- utility: centralized text drawing --------------------
function drawText(txt, x, y, opts = {}) {
    // opts: { size, alignH, alignV, col }
    const size = (opts.size !== undefined) ? opts.size : GLOBAL_TEXT_SIZE;
    const alignH = (opts.alignH !== undefined) ? opts.alignH : CENTER;
    const alignV = (opts.alignV !== undefined) ? opts.alignV : CENTER;
    const col = (opts.col !== undefined) ? opts.col : color(255);
    push();
    textAlign(alignH, alignV);
    textSize(size);
    fill(col);
    noStroke();
    text(txt, x, y);
    pop();
}

function generateRandomUID() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let uid = '#';
    for (let i = 0; i < 8; i++) {
        uid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return uid;
}

function drawLevelIcons(x, y, level, iconSize, spacing) {
    // Draw level icons (1-5) side by side like GTA wanted stars
    // Shows filled icons for unlocked levels, greyed for locked levels
    if (!levelIconImage) return;
    
    push();
    imageMode(LEFT, TOP);
    for (let i = 0; i < MAX_LEVEL; i++) {
        if (i < level && levelIconImage) {
            // Draw filled icon for unlocked level
            image(levelIconImage, x + i * (iconSize + spacing), y, iconSize, iconSize);
        } else if (i >= level && levelIconGreyedImage) {
            // Draw greyed icon for locked level
            image(levelIconGreyedImage, x + i * (iconSize + spacing), y, iconSize, iconSize);
        }
    }
    pop();
}

function drawLeaderboard(startX, startY, boxWidth, rowsToShow = 5) {
    // draws the leaderboard with specified rows
    drawText('Top Earners', startX + 50, startY, 
        { size: 26, alignH: LEFT, alignV: TOP, col: color(255) });
    
    const rowHeight = 40;
    for (let i = 0; i < Math.min(rowsToShow, leaderboard.length); i++) {
        const entry = leaderboard[i];
        const isCurrentPlayer = entry.uid === playerId;
        const col = isCurrentPlayer ? color(100, 255, 100) : color(200);
        
        drawText(`${i + 1}. ${entry.uid}`, startX + 70, startY + 40 + i * rowHeight, 
            { size: 20, alignH: LEFT, alignV: TOP, col: col });
        
        // Draw level icons
        drawLevelIcons(startX + 260, startY + 40 + i * rowHeight + 5, entry.level, 24, 2);
        
        drawText('$' + entry.totalMoney.toFixed(3), startX + boxWidth - 70, startY + 40 + i * rowHeight, 
            { size: 20, alignH: RIGHT, alignV: TOP, col: col });
    }
}

function drawHitCounter() {
    // show index+1 of current game instance in top-right corner
    const hitText = 'Task: ' + (currentInstanceIndex + 1);
    const earnings = '$' + totalMoneyEarned.toFixed(3);
    const uidText = 'ID: ' + playerId;
    const levelText = 'Level: ' + playerLevel;
    const nextLevelIn = (IMAGES_PER_LEVEL - (successfulInstances % IMAGES_PER_LEVEL)) % IMAGES_PER_LEVEL;
    const progressText = nextLevelIn === 0 ? 'Level up!' : nextLevelIn + ' to level up';
    
    drawText(hitText, 30, 40, { size: 48, alignH: LEFT, alignV: TOP, col: color(255) });
    drawText(earnings, 30, 110, { size: 36, alignH: LEFT, alignV: TOP, col: color(100, 255, 100) });
    drawText(uidText, 30, 170, { size: 20, alignH: LEFT, alignV: TOP, col: color(150) });
    
    // Draw level text and icons
    drawText(levelText, 30, 210, { size: 24, alignH: LEFT, alignV: TOP, col: color(255, 200, 100) });    
    drawLevelIcons(30, 255, playerLevel, 32, 2);
    
    // Draw level icons at bottom center
}

function getRandomNumbersFromRange(quantity, max){
  const set = new Set()
  while(set.size < quantity) {
    set.add(Math.floor(Math.random() * max) + 1)
  }
  return Array.from(set)
}

// -------------------- instance management --------------------

function initializeInstance(index) {
    if (index >= GAME_INSTANCES.length) {
        onAllInstancesComplete();
        return;
    }

    const [imgPath, maskPath, timeSeconds] = GAME_INSTANCES[index];
    console.log(`Initializing instance ${index + 1}: ${imgPath}`);

    currentInstanceIndex = index;
    currentGameState = new GameInstance(imgPath, maskPath, timeSeconds * 1000);
    isDisplayingResults = false;
}

function onInstanceComplete(accuracy, earlyBonus = 0) {
    console.log(`Instance ${currentInstanceIndex + 1} completed with accuracy: ${accuracy}%`);
    resultsLog.push(accuracy);

    // calculate reward - only apply early bonus if accuracy threshold is met
    let reward = 0;
    if (accuracy >= ACCURACY_THRESHOLD) {
        reward = REWARD_PER_TASK + earlyBonus; // only add early bonus if accuracy is sufficient
        // increment successful instances counter
        successfulInstances++;
    }
    totalMoneyEarned += reward;

    // update level based on successful instances only
    const newLevel = Math.min(Math.floor(successfulInstances / IMAGES_PER_LEVEL) + 1, MAX_LEVEL);
    if (newLevel > playerLevel) {
        // level up! show unlock screen
        playerLevel = newLevel;
        unlockedLevel = newLevel;
        isDisplayingLevelUnlock = true;
        levelUnlockStartTime = millis();
    } else {
        playerLevel = newLevel;
    }

    isDisplayingResults = true;
    displayResultsTime = millis();
}

function onPlayerExit() {
    console.log('Player exited game');
    currentGameState = null;
    allInstancesComplete = true;
    
    // add to leaderboard with current earnings
    addToLeaderboard(playerId, resultsLog, totalMoneyEarned);
}

function onAllInstancesComplete() {
    console.log('All instances complete!');
    console.log('Results:', resultsLog);
    console.log('Total Money Earned:', totalMoneyEarned);
    currentGameState = null;
    allInstancesComplete = true;    
    // add to leaderboard
    addToLeaderboard(playerId, resultsLog, totalMoneyEarned);
}

// -------------------- GameInstance class --------------------

class GameInstance {
    constructor(imgPath, maskPath, timeMs) {
        this.imgPath = imgPath;
        this.maskPath = maskPath;
        this.timeMs = timeMs;

        this.points = [];
        this.edges = [];
        this.loadedImage = null;
        this.loadedMask = null;
        this.taskDescription = ''; // store task description
        this.earlyCompletionBonus = 0; // early completion bonus

        this.timerStartMillis = 0;
        this.timerRunning = false;
        this.timeLeft = timeMs;
        this.allowInteraction = true;
        this.accuracyPercent = null;

        this._imgDrawX = 0;
        this._imgDrawY = 0;
        this._imgDrawW = 0;
        this._imgDrawH = 0;

        this.loadImageFile(imgPath);
        this.loadMaskFile(maskPath);
        this.loadTaskDescription(imgPath); // load task description
        this.loadCursor(); // load cursor based on level
    }

    loadImageFile(filename) {
        this.loadedImage = loadImage(filename,
            () => { console.log('Image loaded:', filename); },
            () => { console.log('Failed to load image:', filename); }
        );
    }

    loadMaskFile(filename) {
        this.loadedMask = loadImage(filename,
            () => { console.log('Mask loaded:', filename); },
            () => { console.log('Failed to load mask:', filename); }
        );
    }

    loadTaskDescription(imgPath) {
        // extract image index from path (e.g., 'imgs/5.png' -> '5')
        // const imgIndex = imgPath.match(/\d+/)[0];
        // const taskFilePath = `imgs/${imgIndex}.txt`;
        
        // fetch(taskFilePath)
        //     .then(response => {
        //         if (!response.ok) throw new Error('Task file not found');
        //         return response.text();
        //     })
        //     .then(text => {
        //         this.taskDescription = text.trim();
        //         console.log(`Task loaded for instance ${imgIndex}:`, this.taskDescription);
        //     })
        //     .catch(error => {
        //         console.log(`Could not load task file ${taskFilePath}:`, error);
        //         this.taskDescription = 'Trace the most prominent person / object in the image.';
        //     });
        this.taskDescription = 'Trace the most prominent person / object in the image.';
    }

    loadCursor() {
        // load cursor image based on current player level (1-5)
        const cursorPath = `cursors/${playerLevel}.png`;
        loadedCursorImage = loadImage(cursorPath,
            () => { console.log('Cursor loaded for level:', playerLevel); },
            () => { console.log('Failed to load cursor:', cursorPath); loadedCursorImage = null; }
        );
    }

    draw() {
        this.drawImage();
        this.drawPolygon();
        this.drawPoints();
        this.updateTimeLeft();
        this.drawTimer();
        this.drawCursor();
        this.drawTaskDescription(); // draw task at bottom
    }

    drawImage() {
        if (!this.loadedImage) return;

        push();
        imageMode(CENTER);
        const scale = min(windowWidth / this.loadedImage.width, windowHeight / this.loadedImage.height) * 0.8;
        const drawW = this.loadedImage.width * scale;
        const drawH = this.loadedImage.height * scale;
        image(this.loadedImage, windowWidth / 2, windowHeight / 2, drawW, drawH);
        this._imgDrawW = drawW;
        this._imgDrawH = drawH;
        this._imgDrawX = windowWidth / 2 - drawW / 2;
        this._imgDrawY = windowHeight / 2 - drawH / 2;
        pop();
    }

    addPoint(x, y) {
        this.points.push({ x: x, y: y });
        this.updatePolygon();
    }

    updatePolygon() {
        this.edges = [];
        for (let i = 0; i < this.points.length - 1; i++) {
            this.edges.push([i, i + 1]);
        }
        if (this.points.length >= 3) {
            this.edges.push([this.points.length - 1, 0]);
        }
    }

    drawCursor() {
        push();
        if (loadedCursorImage) {
            // draw cursor image centered on mouse
            imageMode(CENTER);
            image(loadedCursorImage, mouseX, mouseY, 30, 30);
        } else {
            // fallback to default cursor
            stroke(outlineColor);
            strokeWeight(2);
            circle(mouseX, mouseY, 8);
        }
        pop();
    }

    drawPolygon() {
        if (this.points.length === 0) return;

        noStroke();
        fill(fillColor);
        beginShape();
        for (let i = 0; i < this.points.length; i++) vertex(this.points[i].x, this.points[i].y);
        if (this.points.length >= 3) endShape(CLOSE); else endShape();

        noFill();
        stroke(outlineColor);
        strokeWeight(3);
        beginShape();
        for (let i = 0; i < this.points.length; i++) vertex(this.points[i].x, this.points[i].y);
        if (this.points.length >= 3) endShape(CLOSE); else endShape();
    }

    drawPoints() {
        const pointSize = 8;
        noStroke();
        fill(outlineColor);
        for (let i = 0; i < this.points.length; i++) {
            const pt = this.points[i];
            rect(pt.x - pointSize/2, pt.y - pointSize /2, pointSize, pointSize);
        }
    }

    startTimer() {
        this.timerStartMillis = millis();
        this.timerRunning = true;
        this.timeLeft = this.timeMs;
        this.accuracyPercent = null;
    }

    updateTimeLeft() {
        if (!this.timerRunning) return;
        const elapsed = millis() - this.timerStartMillis;
        this.timeLeft = max(0, this.timeMs - elapsed);

        if (this.timeLeft <= 0) {
            this.timerRunning = false;
            this.timeLeft = 0;
            this.onTimerEnd();
        }
    }

    drawTimer() {
        const display = (this.timeLeft / 1000).toFixed(2) + 's';
        drawText(display, windowWidth - 30, 40, { size: GLOBAL_TEXT_SIZE, alignH: RIGHT, alignV: TOP, col: color(255) });
    }

    drawTaskDescription() {
        // draw task at bottom center with semi-transparent background
        if (this.taskDescription.length === 0) return;

        push();
        const taskX = windowWidth / 2;
        const taskY = 40;

        // task text
        drawText(this.taskDescription, taskX, taskY, 
            { size: 22, alignH: CENTER, alignV: CENTER, col: color(255) });
        
        // show "Press ENTER to submit" hint if timer is running
        if (this.allowInteraction && this.timerRunning) {
            drawText('Press ENTER to submit early', taskX, windowHeight - 50, 
                { size: 16, alignH: CENTER, alignV: CENTER, col: color(255) });
        }

        pop();
    }

    onTimerEnd() {
        this.allowInteraction = false;
        this.accuracyPercent = this.computePolygonMaskAccuracy();

        // exit instance with no early bonus
        onInstanceComplete(this.accuracyPercent, 0);
    }

    completeEarly() {
        // user hit ENTER to complete early
        if (!this.allowInteraction || !this.timerRunning) return;
        
        this.timerRunning = false;
        this.allowInteraction = false;
        this.accuracyPercent = this.computePolygonMaskAccuracy();

        // check if time bonus qualifies (more than 5 seconds left)
        if (this.timeLeft > TIME_BONUS_THRESHOLD) {
            this.earlyCompletionBonus = TIME_BONUS_REWARD;
            console.log('Early completion bonus earned:', this.earlyCompletionBonus);
        }

        // exit instance with early bonus if applicable
        onInstanceComplete(this.accuracyPercent, this.earlyCompletionBonus);
    }

    computePolygonMaskAccuracy() {
        if (!this.loadedMask) return 0;
        if (this.points.length === 0) return 0;

        const maskW = this.loadedMask.width;
        const maskH = this.loadedMask.height;
        const pg = createGraphics(maskW, maskH);
        pg.pixelDensity(1);
        pg.background(0);
        pg.noStroke();
        pg.fill(255);

        pg.beginShape();
        for (let i = 0; i < this.points.length; i++) {
            const cx = this.points[i].x;
            const cy = this.points[i].y;
            const mx = (this._imgDrawW > 0) ? map(cx, this._imgDrawX, this._imgDrawX + this._imgDrawW, 0, maskW) : cx;
            const my = (this._imgDrawH > 0) ? map(cy, this._imgDrawY, this._imgDrawY + this._imgDrawH, 0, maskH) : cy;
            pg.vertex(mx, my);
        }
        if (this.points.length >= 3) pg.endShape(CLOSE); else pg.endShape();

        pg.loadPixels();
        this.loadedMask.loadPixels();
        const pgPixels = pg.pixels;
        const maskPixels = this.loadedMask.pixels;
        const totalPixels = maskW * maskH;

        let maskWhiteCount = 0;
        let polyWhiteCount = 0;
        let overlapCount = 0;

        for (let i = 0; i < totalPixels; i++) {
            const idx = i * 4;
            const maskRed = maskPixels[idx], maskGreen = maskPixels[idx + 1], maskBlue = maskPixels[idx + 2];
            const maskBright = (maskRed + maskGreen + maskBlue) / 3;
            const maskIsWhite = maskBright > 127;

            const polyRed = pgPixels[idx], polyGreen = pgPixels[idx + 1], polyBlue = pgPixels[idx + 2];
            const polyBright = (polyRed + polyGreen + polyBlue) / 3;
            const polyIsWhite = polyBright > 127;

            if (maskIsWhite) maskWhiteCount++;
            if (polyIsWhite) polyWhiteCount++;
            if (maskIsWhite && polyIsWhite) overlapCount++;
        }

        if (maskWhiteCount === 0) {
            return (polyWhiteCount === 0) ? 100 : 0;
        }

        // Weighted Intersection over Union
        const falseNegatives = maskWhiteCount - overlapCount; // pixels in mask but not in polygon
        const falsePositives = polyWhiteCount - overlapCount; // pixels in polygon but not in mask
        const weightedUnion = overlapCount + WEIGHT_FALSE_NEGATIVES * falseNegatives + WEIGHT_FALSE_POSITIVES * falsePositives;
        const accuracy = (weightedUnion > 0) ? (overlapCount / weightedUnion) * 100 : 0;
        return constrain(accuracy, 0, 100);
    }

    drawAccuracy() {
        const txt = (this.accuracyPercent !== null) ? this.accuracyPercent.toFixed(2) + '%' : '0.00%';
        push();
        textAlign(CENTER, CENTER);
        textSize(72);
        fill(255);
        noStroke();
        text(txt, windowWidth / 2, windowHeight / 2);
        pop();
    }

    mouseClicked() {
        if (!this.allowInteraction) return;
        this.addPoint(mouseX, mouseY);
        if (!this.timerRunning) {
            this.startTimer();
        }
    }

    keyPressed() {
        // handle ENTER for early completion
        if (key === 'Enter' || key === 'Space') {
            this.completeEarly();
        }
    }
}