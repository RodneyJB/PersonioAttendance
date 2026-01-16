import axios from "axios";
import cron from "node-cron";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

async function getPersonioToken() {
  const res = await axios.post("https://api.personio.de/v1/auth", {
    client_id: process.env.PERSONIO_CLIENT_ID,
    client_secret: process.env.PERSONIO_CLIENT_SECRET
  });

  return res.data?.data?.token;
}

async function getEmployee(employeeId) {
  const token = await getPersonioToken();

  try {
    const res = await axios.get(`https://api.personio.de/v1/company/employees/${employeeId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    return res.data?.data || {};
  } catch (error) {
    console.error("Error fetching employee", employeeId, error.message);
    return {};
  }
}
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const token = await getPersonioToken();

  if (!token) {
    console.error("No Personio token returned");
    return [];
  }

  try {
    const res = await axios.get("https://api.personio.de/v1/company/attendances", {
      headers: { Authorization: `Bearer ${token}` },
      params: { start_date: yesterday, end_date: today }
    });

    const rows = res.data?.data || [];
    console.log(`Fetched ${rows.length} attendances for ${yesterday} to ${today}`);
    if (rows.length === 0) {
      console.log("API response data:", JSON.stringify(res.data, null, 2));
    }
    return rows;
  } catch (error) {
    console.error("Error fetching attendances from Personio", error.response?.data || error.message);
    return [];
  }
}

async function pushToMonday(row) {
  const attributes = row.attributes || {};
  console.log("Attendance attributes:", JSON.stringify(attributes, null, 2));

  const employeeData = await getEmployee(attributes.employee);
  const employeeName = employeeData.first_name && employeeData.last_name
    ? `${employeeData.first_name} ${employeeData.last_name}`
    : "Personio Attendance";
  const email = employeeData.email || "";

  const itemName = email || employeeName;

  const start = attributes.start_time;
  const end = attributes.end_time;

  const hours = start && end
    ? (new Date(`${attributes.date}T${end}:00`) - new Date(`${attributes.date}T${start}:00`)) / 3600000
    : 0;

  const columnValues = {
    text_mkzm768y: attributes.employee,
    date4: attributes.date,
    date_mkzm3eqt: attributes.date,
    numeric_mkzm4ydj: Number(hours.toFixed(2)),
    text_mkzm7ea3: attributes.id_v2 || row.id
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

  try {
    const response = await axios.post(
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

    if (response.data?.errors) {
      console.error("Monday API errors:", response.data.errors);
      throw new Error("Monday API error");
    }

    console.log("Created Monday item", response.data?.data?.create_item?.id || "(no id)");
    if (!response.data?.data?.create_item?.id) {
      console.log("Monday API response:", JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    console.error("Error pushing attendance to Monday", error.response?.data || error.message);
    throw error;
  }
}

async function syncOnce() {
  console.log("Starting sync run", new Date().toISOString());
  const data = await getAttendances();
  console.log(`Sync run: processing ${data.length} attendances`);

  for (const row of data) {
    try {
      await pushToMonday(row);
    } catch (error) {
      console.error("Failed to push individual attendance", row.id || row.attributes?.id, error.response?.data || error.message);
    }
  }

  console.log("Finished sync run", new Date().toISOString());
}

cron.schedule("* * * * *", async () => {
  try {
    await syncOnce();
  } catch (error) {
    console.error("Sync error", error.response?.data || error.message);
  }
});

(async () => {
  try {
    await syncOnce();
  } catch (error) {
    console.error("Initial sync error", error.response?.data || error.message);
  }
})();

// Minimal HTTP server so Render Web Service sees an open port
const app = express();
const port = process.env.PORT || 3000;

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

app.get("/", (_req, res) => {
  res.status(200).send("Personio-Monday sync is running");
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
