//node packages
const axios = require("axios");
const fs = require("fs").promises;
const cron = require("node-cron");
require("dotenv").config();

//globals
const FREEPBX_TOKEN_URL = process.env.FREEPBX_TOKEN_URL;
const FREEPBX_API_URL = process.env.FREEPBX_API_URL;
const FREEPBX_AUTH_URL = process.env.FREEPBX_AUTH_URL;
const FREEPBX_GQL_URL = process.env.FREEPBX_GQL_URL;
const FREEPBX_CLIENT_ID = process.env.FREEPBX_CLIENT_ID;
const FREEPBX_CLIENT_SECRET = process.env.FREEPBX_CLIENT_SECRET;
const FREEPBX_SCOPE = process.env.FREEPBX_SCOPE;
const DS_RINGGROUP = process.env.DS_RINGGROUP;
const BACKUP_DS_RINGGROUP = process.env.BACKUP_DS_RINGGROUP;
const DS_CALLER_ID = process.env.DS_CALLER_ID;
const NIGHT_CRON_STRING = process.env.NIGHT_CRON_STRING;
const DAY_CRON_STRING = process.env.DAY_CRON_STRING;
const DS_URL = process.env.DS_URL;
const DS_URL_TOKEN = process.env.DS_URL_TOKEN;
const SUPERVISOR_INFO_FILE = process.env.SUPERVISOR_INFO_FILE;
const TZ = process.env.TZ;

//oauth  stuff

const config = {
  client: {
    id: FREEPBX_CLIENT_ID,
    secret: FREEPBX_CLIENT_SECRET,
  },
  auth: {
    tokenHost: FREEPBX_API_URL,
    tokenPath: "token",
  },
};

const { ClientCredentials } = require("simple-oauth2");

const client = new ClientCredentials(config);

const tokenParams = {
  scope: FREEPBX_SCOPE.split(" "),
};

//helper functions

const getNightSupId = async () => {
  const { data: nightSup } = await axios.get(`${DS_URL}?token=${DS_URL_TOKEN}`);
  return nightSup;
};

const getSups = async () => {
  const sups = await fs.readFile(`./${SUPERVISOR_INFO_FILE}`, "utf-8");
  return JSON.parse(sups);
};

//a sup's numbers, formatted for a FreePBX ring group extension list
const formatNumbers = (sup) => [
  ...(sup.external_phone_numbers || []).map((num) => `${num}#`),
  ...(sup.internal_extensions || []),
];

const generateNumberList = async (include) => {
  const { supervisors: sups } = await getSups();
  return sups
    .filter(include)
    .flatMap(formatNumbers)
    .join("-");
};

const generateDsNumberList = (nightSup) =>
  generateNumberList((sup) => sup.id == nightSup);

//only an explicit `true` in sups.json opts a supervisor in
const generateBackupDsNumberList = () =>
  generateNumberList((sup) => sup.backup_night === true);

const generateDayDsNumberList = () =>
  generateNumberList((sup) => sup.day === true);

const handleDay = async () => {
  const dsNumberList = await generateDayDsNumberList();
  if (!dsNumberList) {
    console.log('No supervisors have "day": true in sups.json');
  }
  let accessToken;
  try {
    accessToken = await client.getToken(tokenParams, { json: true });
    // console.log(accessToken.token.access_token);
  } catch (error) {
    console.log("Access token error: ", error.message);
  }
  const res = await axios.post(
    FREEPBX_GQL_URL,
    {
      query: `mutation{
        updateRingGroup(input:{
          groupNumber:${DS_RINGGROUP}
          description:"Main DS"
          extensionList:"${dsNumberList}"
          strategy:"ringall"
          ringTime: "60"
          changecid: "fixed"
          fixedcid: "${DS_CALLER_ID}"
        }) {
          message status
        }
      }`,
    },
    { headers: { Authorization: `Bearer ${accessToken.token.access_token}` } }
  );

  const backupRes = await axios.post(
    FREEPBX_GQL_URL,
    {
      query: `mutation{
        updateRingGroup(input:{
          groupNumber:${BACKUP_DS_RINGGROUP}
          description:"Backup DS"
          extensionList:"${dsNumberList}"
          strategy:"ringall"
          ringTime: "60"
          callRecording: "force"
          changecid: "fixed"
          fixedcid: "${DS_CALLER_ID}"
        }) {
          message status
        }
      }`,
    },
    { headers: { Authorization: `Bearer ${accessToken.token.access_token}` } }
  );

  const reloadRes = await axios.post(
    FREEPBX_GQL_URL,
    {
      query: `mutation{
        doreload(input:{}) {
          message
          status
          transaction_id
        }
      }`,
    },
    { headers: { Authorization: `Bearer ${accessToken.token.access_token}` } }
  );

  return {
    main: res.status,
    backup: backupRes.status,
    reload: reloadRes.status,
  };
};

const handleNight = async (nightSup) => {
  const backupDsNumberList = await generateBackupDsNumberList();
  let dsNumberList = nightSup > 0 ? await generateDsNumberList(nightSup) : "";
  if (!dsNumberList) {
    //no night sup scheduled, or they aren't in sups.json:
    //the backup_night sups take the main group too
    console.log(
      `No numbers for night sup "${nightSup}"; using backup_night supervisors`
    );
    dsNumberList = backupDsNumberList;
  }
  let accessToken;
  try {
    accessToken = await client.getToken(tokenParams, { json: true });
    // console.log(accessToken.token.access_token);
  } catch (error) {
    console.log("Access token error: ", error.message);
  }

  const res = await axios.post(
    FREEPBX_GQL_URL,
    {
      query: `mutation{
        updateRingGroup(input:{
          groupNumber:${DS_RINGGROUP}
          description:"Main DS"
          extensionList:"${dsNumberList}"
          strategy:"ringall"
          ringTime: "15"
          callRecording: "force"
          changecid: "fixed"
          fixedcid: "${DS_CALLER_ID}"
        }) {
          message status
        }
      }`,
    },
    { headers: { Authorization: `Bearer ${accessToken.token.access_token}` } }
  );

  const backupRes = await axios.post(
    FREEPBX_GQL_URL,
    {
      query: `mutation{
        updateRingGroup(input:{
          groupNumber:${BACKUP_DS_RINGGROUP}
          description:"Backup DS"
          extensionList:"${backupDsNumberList}"
          strategy:"ringall"
          ringTime: "60"
          callRecording: "force"
          changecid: "fixed"
          fixedcid: "${DS_CALLER_ID}"
        }) {
          message status
        }
      }`,
    },
    { headers: { Authorization: `Bearer ${accessToken.token.access_token}` } }
  );

  const reloadRes = await axios.post(
    FREEPBX_GQL_URL,
    {
      query: `mutation{
        doreload(input:{}) {
          message
          status
          transaction_id
        }
      }`,
    },
    { headers: { Authorization: `Bearer ${accessToken.token.access_token}` } }
  );

  return {
    main: res.status,
    backup: backupRes.status,
    reload: reloadRes.status,
  };
};

//cron scheduling

cron.schedule(
  NIGHT_CRON_STRING,
  async () => {
    handleNight(await getNightSupId());
  },
  { timezone: TZ }
);

cron.schedule(
  DAY_CRON_STRING,
  () => {
    handleDay();
  },
  { timezone: TZ }
);

(async () => {
  const dayArr = DAY_CRON_STRING.split(" ");
  const nightArr = NIGHT_CRON_STRING.split(" ");
  const h = new Date().getHours();

  //check on application start (i.e. the
  //cronjob hasn't run yet)
  if (h >= dayArr[1] && h < nightArr[1]) {
    //it's daytime
    handleDay();
  } else {
    //it's nighttime
    handleNight(await getNightSupId());
  }
})();
