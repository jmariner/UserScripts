// ==UserScript==
// @name         Genshin Impact Battle Chronicle: Show Live Data
// @version      2.9
// @description  Shows live data in the BC that's only visible in app (resin, commissions, etc)
// @author       jmariner
// @match        https://act.hoyolab.com/app/community-game-records-sea/index.html?*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=hoyolab.com
// @require      https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js
// @require      https://cdn.jsdelivr.net/npm/dayjs@1/plugin/calendar.js
// @require      https://cdn.jsdelivr.net/npm/dayjs@1/plugin/relativeTime.js
// @require      https://cdn.jsdelivr.net/npm/dayjs@1/plugin/utc.js
// @require      https://cdn.jsdelivr.net/npm/dayjs@1/plugin/timezone.js
// @require      https://cdn.jsdelivr.net/npm/js-md5@0.7.3/src/md5.min.js
// @grant        none
// ==/UserScript==

const DATA_UPDATE_DELAY = 3 * 60 * 1000;
const TIME_24 = true;
const DS_SECRET = "6s25p5ox5y14umn1p61aqyyvbvvl3lrt";
const API_URL = "https://bbs-api-os.hoyolab.com/game_record/genshin/api/dailyNote";
const TEST_DATA = `{"current_resin":160,"max_resin":160,"resin_recovery_time":"0","finished_task_num":4,"total_task_num":4,"is_extra_task_reward_received":false,"remain_resin_discount_num":3,"resin_discount_num_limit":3,"current_expedition_num":5,"max_expedition_num":5,"expeditions":[{"avatar_side_icon":"https://upload-os-bbs.mihoyo.com/game_record/genshin/character_side_icon/UI_AvatarIcon_Side_Ambor.png","status":"Finished","remained_time":"0"},{"avatar_side_icon":"https://upload-os-bbs.mihoyo.com/game_record/genshin/character_side_icon/UI_AvatarIcon_Side_Kaeya.png","status":"Finished","remained_time":"0"},{"avatar_side_icon":"https://upload-os-bbs.mihoyo.com/game_record/genshin/character_side_icon/UI_AvatarIcon_Side_Lisa.png","status":"Finished","remained_time":"0"},{"avatar_side_icon":"https://upload-os-bbs.mihoyo.com/game_record/genshin/character_side_icon/UI_AvatarIcon_Side_Yelan.png","status":"Finished","remained_time":"0"},{"avatar_side_icon":"https://upload-os-bbs.mihoyo.com/game_record/genshin/character_side_icon/UI_AvatarIcon_Side_Shinobu.png","status":"Finished","remained_time":"0"}],"current_home_coin":2400,"max_home_coin":2400,"home_coin_recovery_time":"0","calendar_url":"","transformer":{"obtained":true,"recovery_time":{"Day":0,"Hour":21,"Minute":0,"Second":0,"reached":true},"wiki":"","noticed":false,"latest_job_id":"0"}}`;
const USE_TEST_DATA = false;

const { md5, dayjs } = window;
dayjs.extend(window.dayjs_plugin_calendar);
dayjs.extend(window.dayjs_plugin_relativeTime);
dayjs.extend(window.dayjs_plugin_utc);
dayjs.extend(window.dayjs_plugin_timezone);
const TIME_FMT = TIME_24 ? "HH:mm" : "hh:mm A";

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.substring(1);
}

function makeDS() {
    const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const t = Math.floor(Date.now() / 1000);
    const r = [...Array(6)].map(_ => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
    const h = md5(`salt=${DS_SECRET}&t=${t}&r=${r}`);
    return [t, r, h].join(",");
}

function formatTime(dateArg, nowStr = "Now") {
    if (typeof dateArg === "number" && dateArg <= 0) {
        return nowStr;
    }

    const date = (
        !dateArg ? dayjs() :
        typeof dateArg === "number" ? dayjs().add(dateArg, "s") :
        dayjs.isDayjs(dateArg) ? dateArg :
        dayjs(dateArg)
    );
    return date.calendar(null, {
        sameDay: TIME_FMT,
        nextDay: TIME_FMT,
        nextWeek: "ddd " + TIME_FMT,
    });
}

function formatExpeditionCounts(exData, maxExCount) {
    const exFinished = exData.filter(e => e.status === "Finished").length;
    const inactiveCount = maxExCount - exData.length;
    return [
        `${exFinished}/${exData.length}`,
        inactiveCount > 0 ? inactiveCount + " not active" : "All active",
        exFinished === exData.length,
    ];
}

function formatExpeditionReadyTimes(exData, doneStr) {
    const exTimes = exData.map(e => parseInt(e.remained_time, 10));
    const maxExTime = Math.max(...exTimes);
    const minExTime = Math.min(...exTimes);
    return [
        maxExTime > 0 ? formatTime(maxExTime) : doneStr,
        minExTime !== maxExTime && minExTime > 0 ? `Some done early, at ${formatTime(minExTime)}` : "All done at same time",
    ];
}

function formatTransformerTimes(transformerData, readyStr) {
    const { Day, Hour, Minute, Second, reached } = transformerData;
    if (reached) {
        return [readyStr, null, true];
    }

    let sec = Second + Minute*60 + Hour*60*60;

    // seems like only one of Day, Hour, Minute, Second are ever > 0,
    // so output times rounded to next hour/minute as estimates
    if (Day > 0) {
        return [
            dayjs().add(Day, "d").calendar(null, { nextDay: "[Tomorrow]", nextWeek: "[Next] ddd" }),
            `In ~${Day} days`,
        ];
    }
    if (Hour > 0) {
        // endOf returns :59 instead of :00 so subtract then add back 1s.
        // this also serves to handle input times at :00 which would normally get sent to the next hour/minute
        return [
            "~" + formatTime(dayjs().add(sec - 1, "s").endOf("hour").add(1, "s")),
            `In ~${Hour} hours`,
        ];
    }
    if (Minute > 0 || Second > 0) {
        return [
            "~" + formatTime(dayjs().add(sec - 1, "s").endOf("minute").add(1, "s")),
            Second > 0 ? `In ~${Second} seconds` : `In ~${Minute} minutes`,
        ];
    }

    return ["huh?", null];
}

function formatResinTimes(resinReadySecStr, resinNow, resinMax) {
    const SEC_PER_RESIN = 8 * 60;
    const RESIN_EXTRA_BREAKPOINTS = [20, 30, 40, 60, 80, 120];
    const RESIN_USE_BREAKPOINTS = [20, 30, 40, 60, 80, 120, 160];
    const sec = parseInt(resinReadySecStr, 10);

    const extraTimes = [
        ...RESIN_EXTRA_BREAKPOINTS.filter(x => x > resinNow).map(x => (
            `${x.toString().padEnd(3, " ")} Resin at: ${formatTime(sec - (resinMax - x) * SEC_PER_RESIN)}`
        )),
        "",
        ...RESIN_USE_BREAKPOINTS.filter(x => x <= resinNow).map(x => (
            `After using ${x} resin, full at: ${formatTime(sec + SEC_PER_RESIN * x)}`
        )),
    ];

    return [
        formatTime(sec),
        extraTimes.join("\n").trim(),
    ];
}

function getNextResets() {
    // Reset is always 4AM in GMT-5 for US region.
    // This may break at the DST change but should continue working after the change.
    let nextReset = dayjs(`${dayjs().tz("America/New_York").format("YYYY-MM-DD")}T04:00:00.000-05:00`)
    if (nextReset.isBefore(dayjs()))
        nextReset = nextReset.add(1, "day")

    const nextWeekly = nextReset.day(1);
    return [nextReset, nextWeekly].map(d => [
        capitalize(d.fromNow()),
        d.calendar(null, {
            sameDay: "[Today at] " + TIME_FMT,
            nextDay: "[Tomorrow at] " + TIME_FMT,
            nextWeek: "[Next] ddd [at] " + TIME_FMT,
        })
    ]);
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


// EXPERIEMNTAL: daily check-in
const DAILY_CHECKIN_LANG = "en-us";
const DAILY_CHECKIN_ACT_ID = "e202102251931481";
const DAILY_CHECKIN_DO_URL = `https://sg-hk4e-api.hoyolab.com/event/sol/sign?lang=${DAILY_CHECKIN_LANG}`;
const DAILY_CHECKIN_STATUS_URL = `https://sg-hk4e-api.hoyolab.com/event/sol/info?lang=${DAILY_CHECKIN_LANG}&act_id=${DAILY_CHECKIN_ACT_ID}`;
const DAILY_CHECKIN_FORCE_SHOW_BUTTON = false;

async function getDailyCheckinData() {
    const checkinStatusResp = await fetch(DAILY_CHECKIN_STATUS_URL, {
        method: "GET",
        credentials: "include",
    });
    const { retcode, data } = await checkinStatusResp.json();
    if (retcode !== 0) {
        throw new Error("Daily checkin failed: couldn't get status, retcode " + retcode);
    }

    return { todayDate: data.today, checkedIn: data.is_sign };
}

function updateDailyCheckin(checkinData, blockElement, onCheckin) {
    async function doCheckin() {
        const resp = await fetch(DAILY_CHECKIN_DO_URL, {
            method: "POST",
            credentials: "include",
            body: JSON.stringify({ act_id: DAILY_CHECKIN_ACT_ID }),
        });

        const { retcode: checkinRet } = await resp.json();
        if (checkinRet !== 0) {
            throw new Error("Daily checkin failed: couldn't check in, retcode " + checkinRet);
        }
    }

    const { todayDate, checkedIn } = checkinData;

    const statusEl = document.createElement("span");
    statusEl.innerText = `Daily Check-In: ${checkedIn ? "DONE" : ""}`;

    let checkinBtn = null;
    if (!checkedIn || DAILY_CHECKIN_FORCE_SHOW_BUTTON) {
        checkinBtn = document.createElement("button");
        checkinBtn.innerText = "Check In Now";
        checkinBtn.addEventListener("click", () => {
            if (!checkedIn) {
                doCheckin().then(onCheckin).catch(console.error);
            }
            else {
                alert("Already checked in");
            }
        });
    }

    const parentEl = document.createElement("div");
    parentEl.classList.add("checkin-area");
    parentEl.appendChild(statusEl);
    if (checkinBtn) {
        parentEl.appendChild(checkinBtn);
    }

    parentEl.title = `Today: ${todayDate}`;

    blockElement.querySelector(".block-title").appendChild(parentEl);
}

async function run() {
    // set up full api url
    const query = await waitForDefined(() => {
        const {responseData, requestQueue} = window.miHoYoUserModelMemoryCache;
        const keys = [...Object.keys(requestQueue), ...Object.keys(responseData)];
        for (const k of keys) {
            const match = /^genshinapi\w+server(\w+)role_id(\d+)$/.exec(k);
            if (match) {
                return { server: match[1], role_id: match[2] };
            }
        }
    });

    const fullURL = `${API_URL}?${new URLSearchParams(query)}`;

    // ===== setup UI =====
    const ID_WRAP = "gibcld-wrap";
    const ID_DATA = "gibcld-data";
    const style = document.createElement("style");
    style.innerHTML = `
    @keyframes gibcld-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    #${ID_WRAP}.loading .refresh-area a svg {
        animation: 1s linear infinite gibcld-spin;
    }
    #${ID_WRAP} .summary-items {
        pointer-events: unset !important;
    }
    #${ID_DATA} .summary-item-layout {
        flex-basis: 25%;
    }
    #${ID_DATA} .summary-item-layout .value {
        position: relative;
    }
    #${ID_DATA} .summary-item-layout.alert .value::after {
        content: "";
        position: absolute;
        top: -4px;
        left: -8px;
        width: 8px;
        height: 8px;
        background-color: red;
        border-radius: 50%;
    }
    #${ID_DATA} .panel {
        position: relative;
    }
    #${ID_DATA} .refresh-area {
        position: absolute;
        bottom: 4px;
        left: 8px;
        font-size: 10px;
        color: #7f858a;
    }
    #${ID_DATA} .refresh-area a {
        color: inherit;
    }
    #${ID_DATA} .refresh-area a svg {
        fill: currentColor;
        stroke: currentColor;
        margin-bottom: -2px;
        margin-left: 1px;
    }
    #${ID_DATA} .view-data-btn {
        position: absolute;
        bottom: 4px;
        right: 8px;
        font-size: 10px;
        color: transparent;
    }
    #${ID_DATA} .view-data-btn:hover {
        color: #7f858a;
    }
    #${ID_DATA} .checkin-area {
        font-size: 1em;
        line-height: 1em;
        color: hsla(0, 0%, 100%, 0.85);
        display: flex;
        align-items: center;
    }
    #${ID_DATA} .checkin-area button {
        background: rgba(0, 0, 0, 0.15);
        border: 1px solid rgb(211, 188, 141);
        border-radius: 7px;
        cursor: pointer;
        margin-left: 4px;
        padding: 4px 6px;
    }
    #${ID_DATA} .checkin-area button:hover {
        background: rgba(0, 0, 0, 0.25);
    }
    `;

    let updateDataTimeout;
    let isLoading = false;
    const wrap = document.createElement("div");
    wrap.id = ID_WRAP;

    const origSummaryEl = await waitForDefined(() => document.querySelector(".summary-block"));

    // ===== display data ======
    async function updateData() {
        clearTimeout(updateDataTimeout);
        try {
            if (isLoading) {
                console.warn("[GIBC Show Live Data] Tried to update data while previous update is still loading.");
                return;
            }

            wrap.classList.add("loading");
            isLoading = true;
            await updateDataInner();
        }
        finally {
            isLoading = false;
            wrap.classList.remove("loading");
            updateDataTimeout = setTimeout(() => updateData().catch(console.error), DATA_UPDATE_DELAY);
        }
    }

    async function updateDataInner() {
        const resp = await fetch(fullURL, {
            method: "GET",
            credentials: "include",
            headers: {
                DS: makeDS(),
                "x-rpc-app_version": "1.5.0",
                "x-rpc-client_type": "5",
            }
        });

        const respData = await resp.json();
        if (respData.retcode !== 0) {
            throw new Error(`Request failed. ${respData.message} (${respData.retcode})`);
        }

        const { data } = USE_TEST_DATA ? ({ data: JSON.parse(TEST_DATA) }) : respData;
        const [ nextDailyReset, nextWeeklyReset ] = getNextResets();

        // EXPERIEMNTAL: daily check-in
        let dailyCheckinData = null;
        try {
            dailyCheckinData = await getDailyCheckinData();
        }
        catch (e) {
            console.error("[DAILY CHECK-IN]", e);
        }

        // update UI
        const oldDataArea = document.getElementById(ID_DATA);
        if (oldDataArea) {
            const oldDataUrl = oldDataArea.querySelector(".view-data-btn").href;
            URL.revokeObjectURL(oldDataUrl);
            oldDataArea.remove();
        }

        const blockArea = origSummaryEl.cloneNode(true);
        blockArea.id = ID_DATA;
        const titleQuestionMark = blockArea.querySelector(".block-title-left-ic-question");
        if (titleQuestionMark) {
            titleQuestionMark.remove();
        }
        const titleEl = blockArea.querySelector(".block-title-text");
        titleEl.innerHTML = titleEl.innerHTML.replace("Summary", "Real-Time Notes");

        const dataEntries = [
            [
                "Resin",
                `${data.current_resin}/${data.max_resin}`,
                null,
                data.current_resin === data.max_resin,
            ],
            [
                "Resin Refilled At",
                ...formatResinTimes(data.resin_recovery_time, data.current_resin, data.max_resin),
            ],
            [
                "Commissions",
                `${data.finished_task_num}/${data.total_task_num}`,
                data.total_task_num === data.finished_task_num ? data.is_extra_task_reward_received ? "Daily reward recieved" : "Daily reward NOT recieved" : null,
                data.total_task_num === data.finished_task_num && !data.is_extra_task_reward_received,
            ],
            [
                "Expeditions",
                ...formatExpeditionCounts(data.expeditions, data.max_expedition_num),
            ],
            [
                "Expeditions Done At",
                ...formatExpeditionReadyTimes(data.expeditions, "Now"),
            ],
            [
                "Weekly Boss Discounts Remaining",
                `${data.remain_resin_discount_num}/${data.resin_discount_num_limit}`,
                data.remain_resin_discount_num > 0 ? "Some discounts remaining" : null,
                data.remain_resin_discount_num > 0,
            ],
            [
                "Teapot Jar of Riches",
                `${data.current_home_coin}/${data.max_home_coin}`,
                "Full at: " + formatTime(parseInt(data.home_coin_recovery_time, 10)),
                data.current_home_coin === data.max_home_coin,
            ],
            [
                "Parametic Transformer Ready At",
                ...(data.transformer.obtained ? formatTransformerTimes(data.transformer.recovery_time, "Now") : ["N/A"]),
            ],
            [
                "Next Daily Reset",
                ...nextDailyReset
            ],
            [
                "Next Weekly Reset",
                ...nextWeeklyReset
            ]
        ].filter(e => e !== null && e.length >= 2);

        const dataArea = blockArea.querySelector(".summary-items");
        while (dataArea.childElementCount > dataEntries.length) {
            dataArea.children[0].remove();
        }
        for (let i = 0; i < dataEntries.length; i++) {
            const childEl = dataArea.children[i];
            const [label, value, title, showAlert] = dataEntries[i];
            if (title) {
                childEl.setAttribute("title", title);
            }
            childEl.classList.toggle("alert", !!showAlert);
            childEl.querySelector(".value").innerText = value.toString();
            childEl.querySelector(".desc").innerText = label;
        }

        const refreshedEl = document.createElement("span");
        refreshedEl.innerText = `Refreshed ${formatTime()}`;
        refreshedEl.classList.add("refresh-area");

        const refreshBtn = document.createElement("a");
        refreshBtn.href = "#";
        refreshBtn.addEventListener("click", (e) => { updateData().catch(console.error); e.preventDefault(); });
        refreshBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="14" width="14" viewBox="0 0 48 48"><path d="M24 40q-6.65 0-11.325-4.675Q8 30.65 8 24q0-6.65 4.675-11.325Q17.35 8 24 8q4.25 0 7.45 1.725T37 14.45V8h3v12.7H27.3v-3h8.4q-1.9-3-4.85-4.85Q27.9 11 24 11q-5.45 0-9.225 3.775Q11 18.55 11 24q0 5.45 3.775 9.225Q18.55 37 24 37q4.15 0 7.6-2.375 3.45-2.375 4.8-6.275h3.1q-1.45 5.25-5.75 8.45Q29.45 40 24 40Z"/></svg>`;
        refreshedEl.appendChild(refreshBtn);

        const dataJsonUrl = URL.createObjectURL(new Blob([JSON.stringify(data, null, 4)]));
        const viewDataBtn = document.createElement("a");
        viewDataBtn.href = dataJsonUrl;
        viewDataBtn.target = "_blank";
        viewDataBtn.classList.add("view-data-btn");
        viewDataBtn.innerText = "View Raw Data";

        blockArea.querySelector(".panel").append(refreshedEl, viewDataBtn);

        // EXPERIEMNTAL: daily check-in
        try {
            if (dailyCheckinData) {
                updateDailyCheckin(dailyCheckinData, blockArea, updateData);
            }
        }
        catch (e) {
            console.error("[DAILY CHECK-IN]", e);
        }

        wrap.prepend(blockArea);
    }

    document.head.appendChild(style);
    origSummaryEl.parentElement.prepend(wrap);

    await updateData();

    window.addEventListener("focus", () => updateData().catch(console.error));
}

run().catch(console.error);
