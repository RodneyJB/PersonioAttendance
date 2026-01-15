import express from "express";
import axios from "axios";
import cron from "node-cron";
import dotenv from "dotenv";

dotenv.config();
const app = express();

async function getPersonioToken() {
  const res = await axios.post("https://api.personio.de/v1/auth", {
    client_id: process.env.PERSONIO_CLIENT_ID,
    client_secret: process.env.PERSONIO_CLIENT_SECRET
  });

  return res.data?.data?.token;
async function getAttendances() {
  const today = new Date().toISOString().slice(0, 10);
  const token = await getPersonioToken();
  const res = await axios.get("https://api.personio.de/v1/company/attendances", {
    headers: { Authorization: `Bearer ${token}` },
    params: { start_date: today, end_date: today }
  });

  return res.data?.data || [];
async function pushToMonday(row) {
  const attributes = row.attributes || {};

  const employeeName = attributes.employee_name || "Personio Attendance";
  const start = attributes.check_in || attributes.start_time;
  const end = attributes.check_out || attributes.end_time;

  const hours = start && end
    ? (new Date(end) - new Date(start)) / 3600000
    : 0;

  const columnValues = {
  text_mkzm768y: attributes.employee_id,
  date4: attributes.date,
  date_mkzm3eqt: attributes.date,
    numeric_mkzm4ydj: Number(hours.toFixed(2)),
    text_mkzm7ea3: attributes.id || row.id
  };
  const query = `
    mutation CreateItem($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_item(
  board_id: $boardId,
  item_name: $itemName,
  column_values: $columnValues
      ) {
        id
      }
    }
  `;

  await axios.post(
    "https://api.monday.com/v2",
    {
      query,
      variables: {
        boardId: Number(process.env.MONDAY_BOARD_ID),
        itemName: employeeName,
        columnValues: JSON.stringify(columnValues)
      }
    },
    {
      headers: {
        Authorization: process.env.MONDAY_API_TOKEN,
        "Content-Type": "application/json"
      }
    }
  );
}

cron.schedule("*/5 * * * *", async () => {
  try {
    const data = await getAttendances();

    for (const row of data) {
      await pushToMonday(row);
    }
  } catch (error) {
    console.error("Sync error", error.response?.data || error.message);
  }
});

app.listen(3000);

import express from "express";
import axios from "axios";
import cron from "node-cron";
import dotenv from "dotenv";

dotenv.config();
const app = express();

async function getPersonioToken() {
  const res = await axios.post("https://api.personio.de/v1/auth", {
    client_id: process.env.PERSONIO_CLIENT_ID,
    client_secret: process.env.PERSONIO_CLIENT_SECRET
  });

  return res.data?.data?.token;
}

async function getAttendances(){
  const today = new Date().toISOString().slice(0,10);

  const res = await axios.get(
    "https://api.personio.de/v1/company/attendances",
    {
      headers:{ Authorization:`Basic ${PERSONIO_AUTH}` },
      params:{ start_date:today; end_date:today }
    }
  );
  return res.data.data;
}

      headers: { Authorization: `Bearer ${token}` },
      params: { start_date: today, end_date: today }
    ? ( new Date(row.attributes.check_out) - new Date(row.attributes.check_in) ) / 3600000
    : 0;

  const query = `
  mutation{
    create_item(
  const attributes = row.attributes || {};

  const employeeName = attributes.employee_name || "Personio Attendance";
  const start = attributes.check_in || attributes.start_time;
  const end = attributes.check_out || attributes.end_time;

  const hours = start && end
    ? (new Date(end) - new Date(start)) / 3600000
    : 0;
        \\"employee_id\\":\\"${row.attributes.employee_id}\\";
  const columnValues = {
    text_mkzm768y: attributes.employee_id,
    date4: attributes.date,
    date_mkzm3eqt: attributes.date,
    numeric_mkzm4ydj: Number(hours.toFixed(2)),
    text_mkzm7ea3: attributes.id || row.id
  };

  const query = `
    mutation CreateItem($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_item(
        board_id: $boardId,
        item_name: $itemName,
        column_values: $columnValues
      ) {
        id
      }
    }
  `;
cron.schedule("*/5 * * * *", async ()=>{
  const data = await getAttendances();
  for(const row of data){
    await pushToMonday(row);
  }
});

app.listen(3000);
