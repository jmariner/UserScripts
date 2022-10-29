// ==UserScript==
// @name         YouTube Time Remaining
// @description  Display the remaining time of a YouTube video during playback.
// @version      1.1
// @author       jmariner
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// ==/UserScript==

const MIN = 60;
const HOUR = MIN * 60;
const DAY = HOUR * 24;

function stringToSec(str) {
    const [sec, min = 0, hour = 0, days = 0] = str.split(":").reverse();
    return parseInt(days) * DAY + parseInt(hour) * HOUR + parseInt(min) * MIN + parseInt(sec);
}

function secToString(sec) {
    return [
        sec > DAY ? Math.floor(sec / DAY) : null,
        sec >= HOUR ? (Math.floor(sec / HOUR) % 24) : null,
        (Math.floor(sec / MIN) % 60),
        sec % MIN,
    ]
    .filter(x => x !== null)
    .map((x, i) => `${x}`.padStart(i > 0 ? 2 : 1, "0"))
    .join(":");
}

function setup() {
    const currentTimeEl = document.querySelector(".ytp-time-current");
    const totalTimeEl = document.querySelector(".ytp-time-duration");
    if (!currentTimeEl || !totalTimeEl) {
        throw new Error("RETRY");
    }

    const timeRemainingEl = document.createElement("span");
    timeRemainingEl.id = "yttr-display";
    totalTimeEl.parentNode.insertBefore(timeRemainingEl, totalTimeEl.nextSibling);

    var timeObserver = new MutationObserver((changes, obs) => {
        const totalTime = stringToSec(totalTimeEl.innerText);
        const currentTime = stringToSec(currentTimeEl.innerText);
        timeRemainingEl.innerText = ` (${secToString(totalTime - currentTime)})`;
    });

    timeObserver.observe(currentTimeEl, {
        childList: true,
    });

    const style = document.createElement("style");
    style.id = "yttr-style";
    style.innerHTML = `
    #yttr-display {
        color: hsl(0 0% 80%);
    }
    `;
    document.head.appendChild(style);

    console.log("yttr setup complete");
}

const MAX_TRIES = 10;
let tryNum = 0;

function init() {
    try {
        setup();
    }
    catch (e) {
        if (e.message === "RETRY") {
            if (tryNum < MAX_TRIES) {
                tryNum++;
                setTimeout(init, 500);
            }
            else {
                console.error(`yttr setup failed after ${MAX_TRIES} tries`);
            }
        }
        else {
            console.error(e);
        }
    }
}

try {
    init();
}
catch (e) {
    console.error(e);
}