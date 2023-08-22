// ==UserScript==
// @name         YouTube/Twitch Time Remaining
// @description  Display the remaining time of a YouTube/Twitch video during playback.
// @version      2.0
// @author       jmariner
// @match        https://www.youtube.com/*
// @match        https://www.twitch.tv/videos/*
// @match        https://www.twitch.tv/*/video/*
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

async function waitForDefined(getter, retryDelay = 100) {
    return new Promise((resolve) => {
        function tryGet() {
            const maybeVal = getter();
            if (maybeVal) {
                resolve(maybeVal);
            }
            else {
                setTimeout(tryGet, retryDelay);
            }
        }
        tryGet();
    });
}

async function setup({ curTimeSel, totalTimeSel, obs: observerOptions, style, adder: elementAdder }) {
    const currentTimeEl = await waitForDefined(() => document.querySelector(curTimeSel));
    const totalTimeEl = await waitForDefined(() => document.querySelector(totalTimeSel));

    console.log("time remaining - got elements", currentTimeEl, totalTimeEl);

    const timeRemainingEl = document.createElement("span");
    if (style) {
        Object.assign(timeRemainingEl.style, style);
    }
    elementAdder(currentTimeEl, totalTimeEl, timeRemainingEl);

    const changeHandler = (changes, obs) => {
        const totalTime = stringToSec(totalTimeEl.innerText);
        const currentTime = stringToSec(currentTimeEl.innerText);
        timeRemainingEl.innerText = `(${secToString(totalTime - currentTime)})`;
    };
    const timeObserver = new MutationObserver(changeHandler);
    timeObserver.observe(currentTimeEl, observerOptions);

    changeHandler();

    console.log("time remaining - setup complete");
}

const SITES = [
    [
        "youtube.com",
        {
            curTimeSel: ".ytp-time-current",
            totalTimeSel: ".ytp-time-duration",
            obs: { childList: true },
            style: { marginLeft: "4px", color: `hsl(0 0% 80%)` },
            adder: (currentEl, totalEl, el) => totalEl.parentNode.insertBefore(el, totalEl.nextSibling),
        }
    ],
    [
        "twitch.tv",
        {
            curTimeSel: `[data-a-target="player-seekbar-current-time"]`,
            totalTimeSel: `[data-a-target="player-seekbar-duration"]`,
            obs: { childList: true, characterData: true, subtree: true },
            style: { marginLeft: "auto", marginRight: "4px", color: "#fff" },
            adder: (currentEl, totalEl, el) => currentEl.parentNode.insertBefore(el, currentEl.nextSibling),
        }
    ],
];

const config = SITES.find(([str]) => window.location.hostname.includes(str))[1];
if (!config) {
    console.error("no site found for URL:", window.location);
}
else {
    setup(config).catch(console.error);
}