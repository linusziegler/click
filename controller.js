let outlineColor = null;
let fillColor = null;
let font;

const TIME_SECONDS = 30;
const GAME_INSTANCES = [];
const TOTAL_INSTANCES = 50;
const REWARD_PER_TASK = 0.016; // $0.016 = 1.6 cents
const ACCURACY_THRESHOLD = 85; // need 85% to get paid
const TIME_BONUS_REWARD = 0.005; // $0.005 = 0.5 cents
const TIME_BONUS_THRESHOLD = 5000; // need 5 seconds left to get bonus (in ms)

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

// leaderboard state
let playerName = '';
let nameInputActive = true;
let leaderboard = [];
let totalMoneyEarned = 0;

function setup() {
    // load font
    font = loadFont('GamePocket-Regular.ttf');
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

}

function draw() {
    background(0);
    
    if (nameInputActive) {
        drawNameInputScreen();
    } else if (allInstancesComplete) {
        // show final results screen
        drawFinalResultsScreen();
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
    if (nameInputActive) return;
    if (!isDisplayingResults && currentGameState) {
        currentGameState.mouseClicked();
    }
}

function keyPressed() {
    if (nameInputActive) {
        handleNameInput();
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

// -------------------- name input --------------------

function drawNameInputScreen() {
    push();
    textAlign(CENTER, CENTER);
    
    drawText('Your Name', windowWidth / 2, windowHeight / 2 - 100, 
        { size: 48, alignH: CENTER, alignV: CENTER, col: color(255) });
    
    // draw input box
    push();
    fill(0);
    stroke(255);
    strokeWeight(3);
    rect(windowWidth / 2 - 200, windowHeight / 2, 400, 60);
    
    fill(255);
    strokeWeight(0);
    textAlign(LEFT, CENTER);
    textSize(36);
    text(playerName + (frameCount % 30 < 15 ? '|' : ''), windowWidth / 2 - 180, windowHeight / 2 + 30);
    pop();
    
    drawText('Press ENTER to start', windowWidth / 2, windowHeight / 2 + 150, 
        { size: 24, alignH: CENTER, alignV: CENTER, col: color(255) });
    
    pop();
}

function handleNameInput() {
    if (key === 'Enter') {
        if (playerName.trim().length > 0) {
            nameInputActive = false;
            initializeInstance(0);
        }
    } else if (key === 'Backspace') {
        playerName = playerName.slice(0, -1);
    } else if (playerName.length < 15 && key.length === 1) {
        playerName += key;
    }
}

// -------------------- instance result screen --------------------

function drawInstanceResultScreen() {
    const accuracy = resultsLog[resultsLog.length - 1];
    const reward = accuracy >= ACCURACY_THRESHOLD ? REWARD_PER_TASK : 0;
    const earlyBonus = (accuracy >= ACCURACY_THRESHOLD && currentGameState) ? currentGameState.earlyCompletionBonus : 0;
    const totalReward = reward + earlyBonus;
    
    const boxWidth = 600;
    const boxHeight = 550;
    const startX = (windowWidth - boxWidth) / 2;
    const startY = (windowHeight - boxHeight) / 2;

    push();
    fill(0);
    stroke(255);
    strokeWeight(3);
    rect(startX, startY, boxWidth, boxHeight);

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

    // buttons
    push();
    textAlign(CENTER, CENTER);
    
    // continue button
    stroke(100, 255, 100);
    strokeWeight(2);
    rect(startX + 50, startY + boxHeight - 100, 200, 60);
    drawText('Continue (C)', startX + 150, startY + boxHeight - 70, 
        { size: 20, alignH: CENTER, alignV: CENTER, col: color(100, 255, 100) });
    
    // exit button
    fill(0);
    stroke(255);
    strokeWeight(2);
    rect(startX + boxWidth - 250, startY + boxHeight - 100, 200, 60);
    drawText('Exit & Claim (E)', startX + boxWidth - 150, startY + boxHeight - 70, 
        { size: 20, alignH: CENTER, alignV: CENTER, col: color(255) });
    
    pop();
    pop();
}

function handleResultsScreenInput() {
    if (key === 'c' || key === 'C' || key === 'Space') {
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
    const boxHeight = 600;
    const startX = (windowWidth - boxWidth) / 2;
    const startY = (windowHeight - boxHeight) / 2;

    fill(0);
    strokeWeight(3);
    rect(startX, startY, boxWidth, boxHeight);

    // title
    drawText('Game Complete!', windowWidth / 2, startY + 30, 
        { size: 40, alignH: CENTER, alignV: TOP, col: color(100, 255, 100) });

    // player info
    drawText(`Player: ${playerName}`, windowWidth / 2, startY + 90, 
        { size: 28, alignH: CENTER, alignV: TOP, col: color(200) });

    // stats
    const avgAccuracy = resultsLog.reduce((a, b) => a + b, 0) / resultsLog.length;
    drawText(`Instances Completed: ${resultsLog.length}`, startX + 50, startY + 150, 
        { size: 22, alignH: LEFT, alignV: TOP, col: color(200) });
    drawText(`Average Accuracy: ${avgAccuracy.toFixed(2)}%`, startX + 50, startY + 200, 
        { size: 22, alignH: LEFT, alignV: TOP, col: color(200) });
    drawText(`Total Earned: $${totalMoneyEarned.toFixed(3)}`, startX + 50, startY + 250, 
        { size: 28, alignH: LEFT, alignV: TOP, col: color(100, 255, 100) });

    // leaderboard
    drawText('Top 5 Earners', startX + 50, startY + 330, 
        { size: 26, alignH: LEFT, alignV: TOP, col: color(255) });
    
    const rowHeight = 40;
    for (let i = 0; i < Math.min(5, leaderboard.length); i++) {
        const entry = leaderboard[i];
        const isCurrentPlayer = entry.name === playerName;
        const col = isCurrentPlayer ? color(100, 255, 100) : color(200);
        
        drawText(`${i + 1}. ${entry.name}`, startX + 70, startY + 370 + i * rowHeight, 
            { size: 20, alignH: LEFT, alignV: TOP, col: col });
        drawText('$' + entry.totalMoney.toFixed(3), startX + boxWidth - 70, startY + 370 + i * rowHeight, 
            { size: 20, alignH: RIGHT, alignV: TOP, col: col });
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

function addToLeaderboard(name, accuracies, totalMoney) {
    const avgAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    // add new entry, or append to existing if name exists
    const existingIndex = leaderboard.findIndex(entry => entry.name === name);
    if (existingIndex !== -1) {
        // update existing entry
        const existingEntry = leaderboard[existingIndex];
        existingEntry.totalMoney += totalMoney;
        existingEntry.accuracies = existingEntry.accuracies.concat(accuracies);
        const newAvgAccuracy = existingEntry.accuracies.reduce((a, b) => a + b, 0) / existingEntry.accuracies.length;
        existingEntry.avgAccuracy = parseFloat(newAvgAccuracy.toFixed(2));
        existingEntry.timestamp = new Date().toLocaleString();
        leaderboard[existingIndex] = existingEntry;
    } else {
        // add new entry
        leaderboard.push({
            name: name,
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

function drawHitCounter() {
    // show index+1 of current game instance in top-right corner
    const hitText = 'Task: ' + (currentInstanceIndex + 1);
    const earnings = '$' + totalMoneyEarned.toFixed(3);
    drawText(hitText, windowWidth - 70, 40, { size: 48, alignH: RIGHT, alignV: TOP, col: color(255) });
    drawText(earnings, windowWidth - 70, 110, { size: 36, alignH: RIGHT, alignV: TOP, col: color(100, 255, 100) });
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
    }
    totalMoneyEarned += reward;

    isDisplayingResults = true;
    displayResultsTime = millis();
}

function onPlayerExit() {
    console.log('Player exited game');
    currentGameState = null;
    allInstancesComplete = true;
    
    // add to leaderboard with current earnings
    addToLeaderboard(playerName, resultsLog, totalMoneyEarned);
}

function onAllInstancesComplete() {
    console.log('All instances complete!');
    console.log('Results:', resultsLog);
    console.log('Total Money Earned:', totalMoneyEarned);
    currentGameState = null;
    allInstancesComplete = true;
    
    // add to leaderboard
    addToLeaderboard(playerName, resultsLog, totalMoneyEarned);
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
        stroke(outlineColor);
        strokeWeight(2);
        circle(mouseX, mouseY, 8);
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
        drawText(display, 70, 40, { size: GLOBAL_TEXT_SIZE, alignH: LEFT, alignV: TOP, col: color(255) });
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

        const maskBlackCount = totalPixels - maskWhiteCount;
        const falsePositive = polyWhiteCount - overlapCount;
        let rawScore = (overlapCount / maskWhiteCount) - (falsePositive / maskBlackCount);
        const accuracy = constrain(max(rawScore, 0) * 100, 0, 100);
        return accuracy;
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