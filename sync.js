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

async function findItemByAttendanceId(attendanceId, token) {
  const query = `
    query {
      boards(ids: ["${process.env.MONDAY_BOARD_ID}"]) {
        items {
          id
          column_values(ids: ["text_mkzm7ea3"]) {
            text
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      "https://api.monday.com/v2",
      { query },
      {
        headers: {
          Authorization: token,
          "Content-Type": "application/json"
        }
      }
    );

    if (response.data?.errors) {
      console.error("Error querying Monday items:", response.data.errors);
      return null;
    }

    const items = response.data?.data?.boards?.[0]?.items || [];
    const item = items.find(item => item.column_values?.[0]?.text === attendanceId);
    return item ? item.id : null;
  } catch (error) {
    console.error("Error finding item by attendance ID:", error.message);
    return null;
  }
}
  const query = `
    mutation ChangeColumnValues($itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(
        item_id: $itemId,
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
          itemId: Number(itemId),
          columnValues: JSON.stringify(columnValues)
        }
      },
      {
        headers: {
          Authorization: token,
          "Content-Type": "application/json"
        }
      }
    );

    if (response.data?.errors) {
      console.error("Monday API errors:", response.data.errors);
      throw new Error("Monday API error");
    }

    console.log("Updated Monday item", itemId);
  } catch (error) {
    console.error("Error updating item:", error.message);
    throw error;
  }
}

async function createItem(boardId, itemName, columnValues, token) {
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
          boardId: Number(boardId),
          itemName,
          columnValues: JSON.stringify(columnValues)
        }
      },
      {
        headers: {
          Authorization: token,
          "Content-Type": "application/json"
        }
      }
    );

    if (response.data?.errors) {
      console.error("Monday API errors:", response.data.errors);
      console.error("Error data:", JSON.stringify(response.data.errors[0]?.extensions?.error_data, null, 2));
      throw new Error("Monday API error");
    }

    const itemId = response.data?.data?.create_item?.id;
    console.log("Created Monday item", itemId || "(no id)");
    if (!itemId) {
      console.log("Monday API response:", JSON.stringify(response.data, null, 2));
      throw new Error("No item ID returned");
    }
    return itemId;
  } catch (error) {
    console.error("Error creating item:", error.message);
    throw error;
  }
}

async function getAttendances() {
  const today = new Date().toISOString().slice(0, 10);
  const token = await getPersonioToken();

  if (!token) {
    console.error("No Personio token returned");
    return [];
  }

  try {
    const res = await axios.get("https://api.personio.de/v1/company/attendances", {
      headers: { Authorization: `Bearer ${token}` },
      params: { start_date: today, end_date: today }
    });

    const rows = res.data?.data || [];
    console.log(`Fetched ${rows.length} attendances for ${today}`);
    if (rows.length === 0) {
      console.log("API response data:", JSON.stringify(res.data, null, 2));
    }
    return rows;
  } catch (error) {
    console.error("Error fetching attendances from Personio", error.response?.data || error.message);
    return [];
  }
}

async function getEmployee(employeeId) {
  const token = await getPersonioToken();

  try {
    const res = await axios.get("https://api.personio.de/v1/company/employees", {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit: 1000 }  // Adjust limit as needed
    });

    const employees = res.data?.data || [];
    return employees.find(emp => emp.id == employeeId) || {};
  } catch (error) {
    console.error("Error fetching employees", error.message);
    return {};
  }
}

async function pushToMonday(row) {
  const attributes = row.attributes || {};
  console.log("Attendance attributes:", JSON.stringify(attributes, null, 2));

  const employeeData = await getEmployee(attributes.employee);
  console.log("Employee data for", attributes.employee, ":", employeeData);
  const employeeName = employeeData.first_name && employeeData.last_name
    ? `${employeeData.first_name} ${employeeData.last_name}`
    : "Personio Attendance";

  const itemName = String(attributes.employee);

  const start = attributes.start_time;
  const end = attributes.end_time;

  const hours = start && end
    ? (new Date(`${attributes.date}T${end}:00`) - new Date(`${attributes.date}T${start}:00`)) / 3600000
    : 0;

  const columnValues = {
    date4: { date: attributes.date, time: attributes.start_time + ":00" },
    numeric_mkzm4ydj: hours.toFixed(2),
    text_mkzm7ea3: attributes.id_v2 || row.id
  };

  // Only set end time if attendance is completed
  if (attributes.end_time) {
    columnValues.date_mkzm3eqt = { date: attributes.date, time: attributes.end_time + ":00" };
  }

  console.log("Column values:", JSON.stringify(columnValues, null, 2));

  const attendanceId = attributes.id_v2 || row.id;

  // Check if item already exists in Monday
  const existingItemId = await findItemByAttendanceId(attendanceId, process.env.MONDAY_API_TOKEN);
  if (existingItemId) {
    console.log(`Item exists for attendance ${attendanceId}, updating item ${existingItemId}`);
    await updateItem(existingItemId, columnValues, process.env.MONDAY_API_TOKEN);
  } else {
    // Create new item
    console.log(`Creating new item for attendance ${attendanceId}`);
    await createItem(process.env.MONDAY_BOARD_ID, itemName, columnValues, process.env.MONDAY_API_TOKEN);
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
