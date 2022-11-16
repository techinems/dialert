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
const NIGHT_CRON_STRING = process.env.NIGHT_CRON_STRING;
const DAY_CRON_STRING = process.env.DAY_CRON_STRING;
const DS_URL = process.env.DS_URL;
const DS_URL_TOKEN = process.env.DS_URL_TOKEN;
const SUPERVISOR_INFO_FILE = process.env.SUPERVISOR_INFO_FILE;

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

const generateDsNumberList = async (nightSup) => {
  const { supervisors: sups } = await getSups();
  let dsNumberList = "";
  for (const sup of sups) {
    if (sup.id == nightSup) {
      for (number of sup.phone_numbers) {
        dsNumberList += number.toString();
        dsNumberList += "-";
      }
    }
  }
  dsNumberList = dsNumberList.slice(0, -1);
  return dsNumberList;
};

const generateBackupDsNumberList = async () => {
  const { supervisors: sups } = await getSups();
  let backupDsNumberList = "";
  for (const sup of sups) {
    if (sup.backup_night) {
      for (number of sup.phone_numbers) {
        backupDsNumberList += number.toString();
        backupDsNumberList += "-";
      }
    }
  }
  backupDsNumberList = backupDsNumberList.slice(0, -1);
  return backupDsNumberList;
};

const generateDayDsNumberList = async () => {
  const { supervisors: sups } = await getSups();
  let dayDsNumberList = "";
  for (const sup of sups) {
    if (sup.day) {
      for (number of sup.phone_numbers) {
        dayDsNumberList += number.toString();
        dayDsNumberList += "-";
      }
    }
  }
  dayDsNumberList = dayDsNumberList.slice(0, -1);
  return dayDsNumberList;
};

const handleNight = async (nightSup) => {
  let dsNumberList;
  if (nightSup <= 0) {
    dsNumberList = await generateBackupDsNumberList();
  } else {
    dsNumberList = await generateDsNumberList(nightSup);
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
          groupNumber:9002
          description:"Main DS"
          extensionList:"${dsNumberList}"
          strategy:"ringall"
          ringTime: "15"
          }) {
          message status
        }
      }`,
    },
    { headers: { Authorization: `Bearer ${accessToken.token.access_token}` } }
  );
  return res.status;
};

//cron scheduling

cron.schedule(NIGHT_CRON_STRING, async () => {
  handleNight(await getNightSupId());
});

cron.schedule(DAY_CRON_STRING, () => {
  handleDay();
});

(async () => {
  console.log(await handleNight(await getNightSupId()));
})();
