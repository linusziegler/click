let width;
let height;

let points = [];        // array of point objects {x,y} in canvas coords
let edges = [];         // array of edges as pairs of indices (optional helper)
let loadedImage;        // store the loaded image
let loadedMask;         // store the mask image (IMG_3210_mask.png)

// timer parameters and state
const TOTAL_TIME_MS = 20 * 1000; // total time in milliseconds (30s)
const TIMER_TEXT_SIZE = 72;      // large text size for timer
let timerStartMillis = 0;        // start time (millis)
let timerRunning = false;        // controls timer running
let timeLeft = TOTAL_TIME_MS;    // global timeLeft in ms (state requested)

// UI / state
let allowInteraction = true;   // disable after timer runs out
let accuracyPercent = null;    // computed when timer ends

// store last drawn image box so mapping from canvas -> image coords works
let _imgDrawX = 0, _imgDrawY = 0, _imgDrawW = 0, _imgDrawH = 0;

function setup() {
    smooth();
    frameRate(60);
    width = windowWidth;
    height = windowHeight;
    createCanvas(width, height);
    // load the base image and mask
    loadImageFile('img2.png');
    loadMaskFile('img2_mask.png');
    // leave timer stopped until first click
}

function draw() {
    background(0);

    // draw the loaded image
    drawImage();
    
    // draw current polygon and control points
    drawPolygon();
    drawPoints();

    // update timer state & render
    updateTimeLeft();
    drawTimer();

    drawCursor();

    // when timer has ended and accuracy computed, display it
    if (!allowInteraction && accuracyPercent !== null) {
        drawAccuracy();
    }
}

// ---------- window / input handlers ----------

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    width = windowWidth;
    height = windowHeight;
    redraw();
}

function mouseClicked() {
    // only allow adding points while interaction allowed and timer still running
    if (!allowInteraction) return;

    addPoint(mouseX, mouseY);

    if (!timerRunning) {
        startTimer();
    }
}

// allow clearing with 'c' while still allowed
function keyPressed() {
    if (!allowInteraction) return;
    if (key === 'c' || key === 'C') {
        points = [];
        edges = [];
    }
}

// -------------------- timer functions --------------------

function startTimer() {
    timerStartMillis = millis();
    timerRunning = true;
    timeLeft = TOTAL_TIME_MS;
    accuracyPercent = null;
}

function updateTimeLeft() {
    if (!timerRunning) return;
    const elapsed = millis() - timerStartMillis;
    timeLeft = max(0, TOTAL_TIME_MS - elapsed);

    // when timer runs out, finalize
    if (timeLeft <= 0) {
        timerRunning = false;
        timeLeft = 0;
        onTimerEnd();
    }
}

function drawTimer() {
    // format seconds with millisecond accuracy (2 decimals)
    const display = (timeLeft / 1000).toFixed(2) + 's';

    push();
    textAlign(LEFT, TOP);
    textSize(TIMER_TEXT_SIZE);
    fill(255);
    noStroke();
    text(display, 100, 100);
    pop();
}

// called once when timer reaches zero
function onTimerEnd() {
    allowInteraction = false; // stop magnifier & point drawing
    // compute accuracy based on mask vs polygon
    accuracyPercent = computePolygonMaskAccuracy();
}

// -------------------- image & mask loading / drawing --------------------

function loadImageFile(filename) {
    loadedImage = loadImage(filename,
        () => { console.log('Image loaded:', filename); },
        () => { console.log('Failed to load image:', filename); }
    );
}

function loadMaskFile(filename) {
    loadedMask = loadImage(filename,
        () => { console.log('Mask loaded:', filename); },
        () => { console.log('Failed to load mask:', filename); }
    );
}

function drawImage() {
    // draw the loaded image centered on canvas, scaled to fit
    if (!loadedImage) return;

    push();
    imageMode(CENTER);
    const scale = min(width / loadedImage.width, height / loadedImage.height) * 0.8;
    const drawW = loadedImage.width * scale;
    const drawH = loadedImage.height * scale;
    image(loadedImage, width / 2, height / 2, drawW, drawH);
    // store top-left and size for mapping to mask image coords
    _imgDrawW = drawW;
    _imgDrawH = drawH;
    _imgDrawX = width / 2 - drawW / 2;
    _imgDrawY = height / 2 - drawH / 2;
    pop();
}

// -------------------- polygon tool functions --------------------

function drawCursor() {
    // draw a custom cursor (crosshair) at mouse position
    push();
    stroke(0, 200, 20);
    strokeWeight(2);
    circle(mouseX, mouseY, 6);
    pop();
}

function addPoint(x, y) {
    points.push({ x: x, y: y });
    updatePolygon();
}

function updatePolygon() {
    edges = [];
    for (let i = 0; i < points.length - 1; i++) {
        edges.push([i, i + 1]);
    }
    if (points.length >= 3) {
        edges.push([points.length - 1, 0]);
    }
}

function drawPolygon() {
    if (points.length === 0) return;

    const fillColor = color(0, 200, 20, 60); // semi-transparent blue
    const outlineColor = color(0, 200, 20, 80);

    // fill
    noStroke();
    fill(fillColor);
    beginShape();
    for (let i = 0; i < points.length; i++) vertex(points[i].x, points[i].y);
    if (points.length >= 3) endShape(CLOSE); else endShape();

    // outline
    noFill();
    stroke(outlineColor);
    strokeWeight(3);
    beginShape();
    for (let i = 0; i < points.length; i++) vertex(points[i].x, points[i].y);
    if (points.length >= 3) endShape(CLOSE); else endShape();
}

function drawPoints() {
    const pointSize = 6;
    noStroke();
    fill(0, 200, 20);
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        circle(p.x, p.y, pointSize);
    }
}

// -------------------- accuracy computation --------------------

function computePolygonMaskAccuracy() {
    // require loadedMask and drawn image area
    if (!loadedMask) {
        console.warn('Mask not loaded, cannot compute accuracy');
        return 0;
    }
    // if no polygon drawn, accuracy is 0
    if (points.length === 0) return 0;

    // create a buffer with mask's native resolution and draw polygon there
    const maskW = loadedMask.width;
    const maskH = loadedMask.height;
    const pg = createGraphics(maskW, maskH);
    pg.pixelDensity(1);
    pg.background(0); // black background
    pg.noStroke();
    pg.fill(255);

    // map polygon points from canvas coords to mask image pixel coords
    pg.beginShape();
    for (let i = 0; i < points.length; i++) {
        const cx = points[i].x;
        const cy = points[i].y;
        const mx = (_imgDrawW > 0) ? map(cx, _imgDrawX, _imgDrawX + _imgDrawW, 0, maskW) : cx;
        const my = (_imgDrawH > 0) ? map(cy, _imgDrawY, _imgDrawY + _imgDrawH, 0, maskH) : cy;
        pg.vertex(mx, my);
    }
    if (points.length >= 3) pg.endShape(CLOSE); else pg.endShape();

    // get pixel arrays
    pg.loadPixels();
    loadedMask.loadPixels();
    const pgPixels = pg.pixels;
    const maskPixels = loadedMask.pixels;
    const totalPixels = maskW * maskH;

    let maskWhiteCount = 0;     // number of white pixels in mask (ground truth)
    let polyWhiteCount = 0;     // number of pixels inside user polygon
    let overlapCount = 0;       // pixels where mask is white AND polygon is white

    for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;

        const mr = maskPixels[idx], mg = maskPixels[idx + 1], mb = maskPixels[idx + 2];
        const maskBright = (mr + mg + mb) / 3;
        const maskIsWhite = maskBright > 127;

        const pr = pgPixels[idx], pgc = pgPixels[idx + 1], pb = pgPixels[idx + 2];
        const polyBright = (pr + pgc + pb) / 3;
        const polyIsWhite = polyBright > 127;

        if (maskIsWhite) maskWhiteCount++;
        if (polyIsWhite) polyWhiteCount++;
        if (maskIsWhite && polyIsWhite) overlapCount++;
    }

    // handle degenerate mask (no white area)
    if (maskWhiteCount === 0) {
        return (polyWhiteCount === 0) ? 100 : 0;
    }

    const maskBlackCount = totalPixels - maskWhiteCount;

    // false positives = polygon area covering mask-black
    const falsePositive = polyWhiteCount - overlapCount;

    // score: reward overlap with mask-white, penalize covering mask-black.
    // -> relation between correctly covered overlap and false positives
    let rawScore = (overlapCount / maskWhiteCount) - (falsePositive / (maskBlackCount));
    const accuracy = constrain(max(rawScore, 0) * 100, 0, 100);
    return accuracy;
}

// draw accuracy in center when available
function drawAccuracy() {
    const txt = (accuracyPercent !== null) ? accuracyPercent.toFixed(2) + '%' : '0.00%';
    push();
    textAlign(CENTER, CENTER);
    textSize(TIMER_TEXT_SIZE);
    fill(255);
    noStroke();
    text(txt, width / 2, height / 2);
    pop();
}