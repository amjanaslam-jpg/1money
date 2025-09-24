// index.js - merged & fixed (stores converted currency & displays converted amount correctly)
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- MySQL Connection (keep your credentials) ---
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "aslam2004", // change if needed
  database: "money"
});

db.connect(async (err) => {
  if (err) {
    console.error("Database connection failed:", err);
    process.exit(1);
  }
  console.log("✅ Connected to MySQL Database: money");

  try {
    // Ensure the transactions table has a converted_currency column.
    // This is safe: MySQL 8 supports ADD COLUMN IF NOT EXISTS.
    // If your MySQL version doesn't support IF NOT EXISTS, run the ALTER manually in Workbench.
    const ensureColSql = `ALTER TABLE transactions 
      ADD COLUMN IF NOT EXISTS converted_currency VARCHAR(10) DEFAULT 'INR'`;
    await db.promise().query(ensureColSql);
    console.log("✅ ensured converted_currency column exists on transactions");
  } catch (e) {
    console.warn("Could not ensure converted_currency column automatically. If you see missing column errors, run:");
    console.warn("ALTER TABLE transactions ADD COLUMN converted_currency VARCHAR(10) DEFAULT 'INR';");
  }
});

// --- small helpers ---
const round = (v, d = 2) => {
  if (typeof v !== "number" || !isFinite(v)) return 0;
  const p = Math.pow(10, d);
  return Math.round(v * p) / p;
};

function respondServerError(res, err, msg = "Internal Server Error") {
  console.error(msg, err);
  return res.status(500).json({ error: msg });
}

// ------------------ Add Staff ------------------
app.post("/add-staff", (req, res) => {
  const { staffId, staffName } = req.body;

  if (!staffId || !staffName) {
    return res.status(400).json({ error: "staffId and staffName required" });
  }

  const sql = "INSERT INTO staff (id, name, balance_inr, balance_sar, balance_aed) VALUES (?, ?, 0, 0, 0)";
  db.query(sql, [staffId, staffName], (err) => {
    if (err) {
      console.error("Add staff error:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: "Staff added successfully!" });
  });
});

// ------------------ Get All Staff (with converted INR) ------------------
app.get("/get-staff", (req, res) => {
  const rateSql = "SELECT sar_to_inr, aed_to_inr FROM conversion_rates WHERE id = 1";
  db.query(rateSql, (rateErr, rateRows) => {
    if (rateErr) {
      console.error("get-staff rates error:", rateErr);
      return res.status(500).json({ error: rateErr.message });
    }
    const rates = rateRows[0] || { sar_to_inr: 0, aed_to_inr: 0 };
    const sarToInr = parseFloat(rates.sar_to_inr) || 0;
    const aedToInr = parseFloat(rates.aed_to_inr) || 0;

    db.query("SELECT * FROM staff", (err, results) => {
      if (err) {
        console.error("get-staff error:", err);
        return res.status(500).json({ error: err.message });
      }

      // Add converted balances for AED & SAR in INR
      const staffWithConverted = results.map(s => {
        let convertedInrFromAed = 0;
        let convertedInrFromSar = 0;
        if (s.balance_aed && aedToInr) {
          convertedInrFromAed = (s.balance_aed * aedToInr).toFixed(2);
        }
        if (s.balance_sar && sarToInr) {
          convertedInrFromSar = (s.balance_sar * sarToInr).toFixed(2);
        }
        return {
          ...s,
          converted_inr_from_aed: convertedInrFromAed,
          converted_inr_from_sar: convertedInrFromSar
        };
      });

      res.json(staffWithConverted);
    });
  });
});


// ------------------ Get single staff (two routes for compatibility) ------------------
async function getStaffByIdHandler(req, res) {
  const staffId = req.params.id || req.params.staffId;
  if (!staffId) return res.status(400).json({ message: "staff id required" });

  try {
    const [[rates]] = await db.promise().query("SELECT sar_to_inr, aed_to_inr FROM conversion_rates WHERE id = 1");
    const sarToInr = parseFloat(rates?.sar_to_inr) || 0;
    const aedToInr = parseFloat(rates?.aed_to_inr) || 0;

    const [rows] = await db.promise().query("SELECT * FROM staff WHERE id = ?", [staffId]);
    if (rows.length === 0) return res.status(404).json({ message: "Staff not found" });

    const s = rows[0];
    const convertedInrFromAed = s.balance_aed && aedToInr ? (s.balance_aed * aedToInr).toFixed(2) : 0;
    const convertedInrFromSar = s.balance_sar && sarToInr ? (s.balance_sar * sarToInr).toFixed(2) : 0;

    res.json({
      ...s,
      converted_inr_from_aed: convertedInrFromAed,
      converted_inr_from_sar: convertedInrFromSar
    });
  } catch (err) {
    console.error("get-staff/:id error:", err);
    res.status(500).json({ message: "Internal Server Error", error: err.message });
  }
}

app.get("/get-staff/:staffId", getStaffByIdHandler);
app.get("/staff/:id", getStaffByIdHandler);

// ------------------ Staff Deposits (list) ------------------
// ------------------ Staff Deposits (list) ------------------
app.get('/staff-deposits/:staffId', (req, res) => {
  const staffId = req.params.staffId;
  const query = `
    SELECT 
      sd.id,
      sd.amount,
      sd.currency,
      sd.description,
      sd.deposited_by,
      COALESCE(d.name, sd.deposited_by) AS deposited_by_name,
      DATE_FORMAT(sd.created_at, '%Y-%m-%d %H:%i:%s') AS deposit_date
    FROM staff_deposit sd
    LEFT JOIN staff d ON d.id = sd.deposited_by
    WHERE sd.staff_id = ?
    ORDER BY sd.created_at ASC
  `;
  db.query(query, [staffId], (err, results) => {
    if (err) {
      console.error("staff-deposits error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    if (!results || results.length === 0) return res.json({ success: false, message: "No deposits found." });

    // map to friendly output (optional)
    const deposits = results.map(r => ({
      id: r.id,
      amount: r.amount,
      currency: r.currency,
      description: r.description,
      deposited_by: r.deposited_by,           // original stored value (for reference)
      deposited_by_name: r.deposited_by_name, // resolved name (preferred for display)
      deposit_date: r.deposit_date
    }));

    res.json({ success: true, deposits });
  });
});

// ------------------ Add Deposit ------------------
app.post("/add-deposit", (req, res) => {
  const { staffId, staffName, amount, currency, description, depositedBy } = req.body;

  if (!staffId || !amount || amount <= 0 || !currency) {
    return res.status(400).json({ success: false, message: "Invalid input" });
  }

  const currencyUpper = (currency || "").toUpperCase();
  let balanceColumn;
  switch (currencyUpper) {
    case "INR": balanceColumn = "balance_inr"; break;
    case "SAR": balanceColumn = "balance_sar"; break;
    case "AED": balanceColumn = "balance_aed"; break;
    default:
      return res.status(400).json({ success: false, message: "Unsupported currency" });
  }

  db.query(`UPDATE staff SET ${balanceColumn} = COALESCE(${balanceColumn},0) + ? WHERE id = ?`, [amount, staffId], (err) => {
    if (err) {
      console.error("add-deposit update error:", err);
      return res.status(500).json({ success: false, message: "Balance update failed" });
    }

    const insertQuery = `
      INSERT INTO staff_deposit (staff_id, staff_name, amount, currency, description, deposited_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `;
    db.query(insertQuery, [staffId, staffName || null, amount, currencyUpper, description || "Deposit", depositedBy || "Admin"], (err2) => {
      if (err2) {
        console.error("add-deposit insert error:", err2);
        return res.status(500).json({ success: false, message: "Insert failed" });
      }

      db.query(`SELECT ${balanceColumn} as updatedBalance FROM staff WHERE id = ?`, [staffId], (err3, rows) => {
        if (err3) {
          console.error("fetch updated balance error:", err3);
          return res.status(500).json({ success: false, message: "Failed to fetch updated balance" });
        }
        const updatedBalance = rows[0]?.updatedBalance || 0;
        res.json({ success: true, message: "Deposit saved successfully", updatedBalance, currency: currencyUpper });
      });
    });
  });
});

// ------------------ Add Expense ------------------
app.post('/add-expense', (req, res) => {
  const { staffId, staffName, amount, reason, deductedFromStaffId, currency } = req.body;
  const date = new Date();

  if (!staffId || !staffName || !amount || !reason) {
    return res.json({ success: false, message: "All fields are required." });
  }

  // 🟢 Case 1: Admin Expense
  if (staffName.toLowerCase() === "admin" && deductedFromStaffId) {
    if (!currency) {
      return res.json({ success: false, message: "Currency is required for admin expense." });
    }

    // Deduct from chosen staff balance in the given currency
    let balanceField = "";
    if (currency === "INR") balanceField = "balance_inr";
    else if (currency === "AED") balanceField = "balance_aed";
    else if (currency === "SAR") balanceField = "balance_sar";
    else return res.json({ success: false, message: "Invalid currency." });

    db.query(
      `UPDATE staff SET ${balanceField} = COALESCE(${balanceField},0) - ? WHERE id = ?`,
      [amount, deductedFromStaffId],
      (errDeduct) => {
        if (errDeduct) {
          console.error("Admin expense deduction error:", errDeduct);
          return res.json({ success: false, message: "Failed to deduct from staff balance." });
        }

        // Insert expense
        const insertQuery = `
          INSERT INTO staff_expenses (staffId, staff_name, amount, reason, date, deducted_from_staff, currency)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        db.query(
          insertQuery,
          [staffId, staffName, amount, reason, date, deductedFromStaffId, currency],
          (errInsert) => {
            if (errInsert) {
              console.error("Admin expense insert error:", errInsert);
              return res.json({ success: false, message: "Failed to add admin expense." });
            }
            res.json({ success: true, message: `Admin expense added (deducted ${amount} ${currency} from Staff ${deductedFromStaffId})!` });
          }
        );
      }
    );
  }

  // 🟢 Case 2: Normal Staff Expense
  else {
    if (!currency) return res.json({ success: false, message: "Currency is required." });

    let balanceField = "";
    if (currency === "INR") balanceField = "balance_inr";
    else if (currency === "AED") balanceField = "balance_aed";
    else if (currency === "SAR") balanceField = "balance_sar";
    else return res.json({ success: false, message: "Invalid currency." });

    const insertQuery = `
      INSERT INTO staff_expenses (staffId, staff_name, amount, reason, date, currency)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    db.query(insertQuery, [staffId, staffName, amount, reason, date, currency], (err, result) => {
      if (err) {
        console.error("add-expense insert error:", err);
        return res.json({ success: false, message: "Failed to add expense." });
      }

      db.query(
        `UPDATE staff SET ${balanceField} = COALESCE(${balanceField},0) - ? WHERE id = ?`,
        [amount, staffId],
        (err2) => {
          if (err2) {
            console.error("add-expense update balance error:", err2);
            return res.json({ success: false, message: "Expense added, but failed to update balance." });
          }
          res.json({ success: true, message: "Expense added and balance updated!" });
        }
      );
    });
  }
});

// ------------------ Get staff expenses by name ------------------
app.get('/get-staff-expenses/:staffName', (req, res) => {
  const staffName = req.params.staffName;
  if (!staffName) return res.status(400).json({ success: false, message: "Staff name is required." });

 const query = `
  SELECT se.staffId, se.staff_name, se.amount, se.reason, se.date,
         se.currency, se.deducted_from_staff,
         s.name AS deducted_from_name
  FROM staff_expenses se
  LEFT JOIN staff s ON se.deducted_from_staff = s.id
  WHERE LOWER(se.staff_name) = LOWER(?)
  ORDER BY se.date DESC
`;

  db.query(query, [staffName], (err, results) => {
    if (err) {
      console.error("get-staff-expenses error:", err);
      return res.status(500).json({ success: false, message: "Database error." });
    }
    res.json({ success: true, expenses: results });
  });
});



// ------------------ Set & Get conversion rates ------------------
app.post("/set-rates", (req, res) => {
  const { sarToInr, aedToInr, sarToAed } = req.body;

  db.query(
    "UPDATE conversion_rates SET sar_to_inr = ?, aed_to_inr = ?, sar_to_aed = ? WHERE id = 1",
    [sarToInr, aedToInr, sarToAed],
    (err) => {
      if (err) {
        console.error("set-rates error:", err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: "Conversion rates updated!" });
    }
  );
});

app.get("/get-rates", (req, res) => {
  db.query("SELECT * FROM conversion_rates WHERE id = 1", (err, results) => {
    if (err) {
      console.error("get-rates error:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results[0] || { sar_to_inr: null, aed_to_inr: null, sar_to_aed: null });
  });
});

// ------------------ Send Money (transactions) ------------------
// This code is kept and improved so it stores converted amount and converted_currency appropriately
app.post("/send-money", (req, res) => {
  const {
    staffId,
    staffName,
    customerName,
    amountSent,       // INR
    receivedMoney,    // amount customer gave (in "currency")
    currency,         // currency of receivedMoney: 'INR'|'AED'|'SAR'
    sendCountry,      // where money was sent (SAR, AED, SAR-AED)
    transactionDate,
    description
  } = req.body;

  const sentINR = Number(amountSent) || 0;
  const receivedForeign = Number(receivedMoney) || 0;
  const dateToUse = transactionDate ? new Date(transactionDate) : new Date();

  if (!staffId || !customerName || !currency) {
    return res.status(400).json({ message: "staffId, customerName, and currency are required" });
  }

  db.query("SELECT sar_to_inr, aed_to_inr, sar_to_aed FROM conversion_rates WHERE id = 1", (rateErr, rateRows) => {
    if (rateErr) return respondServerError(res, rateErr, "send-money rates error");
    if (!rateRows || rateRows.length === 0) return res.status(500).json({ message: "Conversion rates not set" });

    const rates = rateRows[0];
    const sarToInr = parseFloat(rates.sar_to_inr) || 0;
    const aedToInr = parseFloat(rates.aed_to_inr) || 0;
    const sarToAed = parseFloat(rates.sar_to_aed) || 0;

    // Determine sendCountryRateToINR
    let sendCountryRateToINR = 1;
    if (sendCountry === "SAR") sendCountryRateToINR = sarToInr;
    else if (sendCountry === "AED") sendCountryRateToINR = aedToInr;
    else if (sendCountry === "SAR-AED") {
      if (!sarToInr || !sarToAed) sendCountryRateToINR = 0;
      else sendCountryRateToINR = sarToInr;
    }

    // Determine receivedCurrencyRateToINR
    let receivedCurrencyRateToINR = 1;
    if (currency === "SAR") receivedCurrencyRateToINR = sarToInr;
    else if (currency === "AED") receivedCurrencyRateToINR = aedToInr;
    else receivedCurrencyRateToINR = 1; // INR

    // Compute foreignEquivalent (how much foreign was given to customer)
    let foreignEquivalent = 0;
    if (sentINR > 0) {
      if (sendCountry === "SAR-AED" && sarToInr && sarToAed) {
        const sarAmount = sentINR / sarToInr;         // INR -> SAR
        foreignEquivalent = sarAmount * sarToAed;     // SAR -> AED
      } else if (sendCountryRateToINR && sendCountryRateToINR > 0) {
        foreignEquivalent = sentINR / sendCountryRateToINR;
      } else {
        foreignEquivalent = 0;
      }
    }

    // receivedINR (INR equivalent of the money customer paid)
    const receivedINR = (receivedForeign > 0 && receivedCurrencyRateToINR)
      ? (receivedForeign * receivedCurrencyRateToINR)
      : 0;

    const foreignEquivalentRounded = round(foreignEquivalent, 6);
    const receivedINRrounded = round(receivedINR, 2);

    // determine converted amount and converted currency to store
    let convertedAmountValue = 0;
    let convertedCurrency = "INR"; // default for convertedAmount
    if (sendCountry === "SAR" || sendCountry === "AED") {
      // we are sending foreign currency to customer
      convertedAmountValue = foreignEquivalentRounded;
      convertedCurrency = sendCountry === "SAR-AED" ? "AED" : sendCountry;
    } else if (sendCountry === "SAR-AED") {
      convertedAmountValue = foreignEquivalentRounded;
      convertedCurrency = "AED";
    } else {
      // Fallback: if amount is INR only
      convertedAmountValue = sentINR;
      convertedCurrency = "INR";
    }

    // transaction wrapper
    db.beginTransaction((txErr) => {
      if (txErr) return respondServerError(res, txErr, "beginTransaction error");

      const rollback = (err) => {
        db.rollback(() => {
          console.error("TX ROLLBACK:", err);
          const status = (err && err.code && Number.isInteger(err.code)) ? err.code : 500;
          const message = (err && err.msg) ? err.msg : (err && err.message) ? err.message : "Transaction failed";
          return res.status(status).json({ success: false, message });
        });
      };

      // Example flow: deduct staff INR (if sentINR > 0)
      const doDeductStaffINR = (next) => {
        if (sentINR <= 0) return next();

        db.query("SELECT balance_inr FROM staff WHERE id = ? FOR UPDATE", [staffId], (sErr, sRows) => {
          if (sErr) return rollback(sErr);
          if (!sRows || sRows.length === 0) return rollback({ code: 404, msg: "Staff not found" });

          const staffBalance = parseFloat(sRows[0].balance_inr) || 0;
          if (staffBalance < sentINR) return rollback({ code: 400, msg: "Insufficient staff INR balance" });

          const newStaffBalance = round(staffBalance - sentINR, 2);
          db.query("UPDATE staff SET balance_inr = ? WHERE id = ?", [newStaffBalance, staffId], (updErr) => {
            if (updErr) return rollback(updErr);
            return next();
          });
        });
      };

      const getPrevBalancesAndInsert = () => {
        db.query(
          "SELECT customerBalanceINR, customerBalanceForeign FROM transactions WHERE customerName = ? ORDER BY id DESC LIMIT 1",
          [customerName],
          (selErr, rows) => {
            if (selErr) return rollback(selErr);

            let prevINR = 0, prevForeign = 0;
            if (rows && rows.length > 0) {
              prevINR = parseFloat(rows[0].customerBalanceINR) || 0;
              prevForeign = parseFloat(rows[0].customerBalanceForeign) || 0;
            }

            let newINR = prevINR + sentINR - receivedINRrounded;
            let newForeign = prevForeign + foreignEquivalentRounded - receivedForeign;

            newINR = round(newINR, 2);
            newForeign = round(newForeign, 6);
            if (Math.abs(newINR) < 0.01) newINR = 0;
            if (Math.abs(newForeign) < 0.000001) newForeign = 0;

            const insertSql = `
              INSERT INTO transactions 
                (staffId, staffName, customerName, amountSent, receivedMoney, convertedAmount, convertedAmountForeign, sendCountry, currency, customerBalanceINR, customerBalanceForeign, converted_currency, description, \`date\`)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            db.query(insertSql, [
              staffId,
              staffName,
              customerName,
              round(sentINR, 2),
              round(receivedForeign, 6),
              // convertedAmount: store INR-equivalent only if meaningful (keep 0 if foreign used)
              (convertedCurrency === "INR" ? round(convertedAmountValue, 2) : 0),
              // convertedAmountForeign: store foreign amount (if applicable)
              (convertedCurrency === "INR" ? 0 : round(convertedAmountValue, 6)),
              sendCountry || null,
              currency,
              newINR,
              newForeign,
              convertedCurrency,
              description || "",
              dateToUse
            ], (insErr/*, result*/) => {
              if (insErr) return rollback(insErr);
const creditStaffIfNeeded = (cb) => {
  if (!receivedForeign || receivedForeign === 0) return cb();

  let col = null;
  let valueToAdd = 0;
  let targetStaffId = staffId; // default staffId

  if (currency === "SAR") {
    col = "balance_sar";
    valueToAdd = round(receivedForeign, 6);
    targetStaffId = 8; // Tamiz
  } else if (currency === "AED") {
    col = "balance_aed";
    valueToAdd = round(receivedForeign, 6);
    targetStaffId = 9; // Jamil
  } else if (currency === "INR") {
    col = "balance_inr";
    valueToAdd = round(receivedINRrounded, 2);
    // keep default staffId (the staff who handled the transfer)
  }

  if (!col) return cb();

  // 1) update staff balance
  db.query(`UPDATE staff SET ${col} = COALESCE(${col},0) + ? WHERE id = ?`,
    [valueToAdd, targetStaffId],
    (uErr) => {
      if (uErr) {
        console.error("Failed to credit staff balance:", uErr);
        return cb();
      }

      // 2) Log it into staff_deposit (same table your search uses)
      const depositSql = `
        INSERT INTO staff_deposit (staff_id, staff_name, amount, currency, description, deposited_by, created_at)
        VALUES (?, (SELECT name FROM staff WHERE id = ?), ?, ?, ?, ?, ?)
      `;
      const depositedBy = `${customerName} (customer)`;
      // use description if you want to preserve context; otherwise a default
      const depDesc = description && description.trim() ? description.trim() : `Auto credit from ${customerName}`;

      db.query(depositSql,
        [targetStaffId, targetStaffId, valueToAdd, currency, depDesc, depositedBy, dateToUse],
        (depErr) => {
          if (depErr) {
            console.error("Failed to log auto deposit into staff_deposit:", depErr);
            // don't rollback here; deposit logging failing shouldn't break the whole transaction
          }
          return cb();
        }
      );
    }
  );
};


              creditStaffIfNeeded(() => {
                db.commit((cErr) => {
                  if (cErr) return rollback(cErr);
                  return res.json({
                    success: true,
                    message: "Transaction recorded",
                    balances: {
                      inr: newINR,
                      foreign: `${newForeign} ${convertedCurrency}`,
                      convertedForeign: convertedAmountValue
                    }
                  });
                });
              });
            });
          }
        );
      };

      doDeductStaffINR(getPrevBalancesAndInsert);
    });
  });
});

// ------------------ Get transactions (returns array) ------------------
app.get("/transactions", (req, res) => {
  const sqlTransactions = `
    SELECT id, staffId, staffName, customerName, amountSent, receivedMoney,
           convertedAmount, convertedAmountForeign, sendCountry, currency,
           customerBalanceINR, customerBalanceForeign, converted_currency,
           description, date
    FROM transactions
    ORDER BY date ASC
  `;

  const sqlRates = `SELECT * FROM conversion_rates LIMIT 1`;

  db.query(sqlTransactions, (err, transactions) => {
    if (err) return respondServerError(res, err, "Failed to fetch transactions");

    db.query(sqlRates, (err2, ratesResult) => {
      if (err2) return respondServerError(res, err2, "Failed to fetch conversion rates");

      const rates = ratesResult[0] || { sar_to_inr: 0, aed_to_inr: 0, sar_to_aed: 0 };

      const formatted = transactions.map(r => {
        let inr = Number(r.customerBalanceINR) || 0;
        let foreign = Number(r.customerBalanceForeign) || 0;

        if ((inr === 0 && foreign !== 0) || (foreign === 0 && inr !== 0)) {
          // keep as is
        } else if (Math.abs(inr) < 1 && Math.abs(foreign) < 1) {
          inr = 0; 
          foreign = 0;
        }

        let convertedValue = Number(r.convertedAmount) || 0;
        let convertedForeignValue = Number(r.convertedAmountForeign) || 0;
        let convertedCurrency = r.converted_currency || null;

        const sendCurrencyMap = {
          "SAR-AED": "AED",
          "SAUDI": "SAR",
          "DUBAI": "AED",
          "INDIA": "INR"
        };

        let converted_display = "-";
        if (convertedForeignValue && convertedForeignValue !== 0) {
          let cc = convertedCurrency || sendCurrencyMap[r.sendCountry] || r.currency || "INR";
          converted_display = `${convertedForeignValue} ${cc}`;
        } else if (convertedValue && convertedValue !== 0) {
          converted_display = `${convertedValue} INR`;
          convertedCurrency = "INR";
        } else {
          converted_display = `0 ${r.currency || "INR"}`;
        }

        return {
          id: r.id,
          staffId: r.staffId,
          staffName: r.staffName,
          customerName: r.customerName,
          amountSent: Number(r.amountSent) || 0,
          receivedMoney: Number(r.receivedMoney) || 0,
          convertedAmountINR: convertedValue,
          convertedAmountForeign: convertedForeignValue,
          converted_currency: convertedCurrency || sendCurrencyMap[r.sendCountry] || r.currency,
          converted_display,
          sendCountry: r.sendCountry,
          currency: r.currency,
          conversionRates: {
            SAR_to_INR: rates.sar_to_inr,
            AED_to_INR: rates.aed_to_inr,
            SAR_to_AED: rates.sar_to_aed
          },
          description: r.description,
          balances: { inr, foreign },
          date: r.date
        };
      });

      res.json(formatted);
    });
  });
});

// ------------------ Delete transaction ------------------
app.delete("/delete-transaction/:id", (req, res) => {
  const id = req.params.id;
  db.query("DELETE FROM transactions WHERE id = ?", [id], (err) => {
    if (err) {
      console.error("delete-transaction error:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: "Transaction deleted successfully!" });
  });
});

// ------------------ Search deposits ------------------
// ------------------ Search deposits ------------------
app.get("/search-deposits", (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ success: false, message: "Search query required" });
  }

  const searchQuery = `
    SELECT 
      sd.id,
      sd.staff_id,
      s.name AS staff_name,
      sd.amount,
      sd.currency,
      sd.description,
      sd.deposited_by,
      COALESCE(d.name, sd.deposited_by) AS deposited_by_name,
      sd.created_at AS date
    FROM staff_deposit sd
    LEFT JOIN staff s ON s.id = sd.staff_id
    LEFT JOIN staff d ON d.id = sd.deposited_by
    WHERE sd.id LIKE ? 
       OR s.name LIKE ? 
       OR sd.description LIKE ? 
       OR sd.deposited_by LIKE ?
    ORDER BY sd.created_at ASC
  `;
  const like = `%${query}%`;
  db.query(searchQuery, [like, like, like, like], (err, results) => {
    if (err) {
      console.error("search-deposits error:", err);
      return res.status(500).json({ success: false, message: "Search failed" });
    }
    // return depositor name for display
    const data = (results || []).map(r => ({
      id: r.id,
      staff_id: r.staff_id,
      staff_name: r.staff_name,
      amount: r.amount,
      currency: r.currency,
      description: r.description,
      deposited_by: r.deposited_by,
      deposited_by_name: r.deposited_by_name,
      date: r.date
    }));
    res.json({ success: true, data });
  });
});


// ------------------ Delete staff ------------------
app.delete("/delete-staff/:id", (req, res) => {
  const staffId = req.params.id;

  // Just delete from staff table
  db.query("DELETE FROM staff WHERE id = ?", [staffId], (err, result) => {
    if (err) {
      console.error("delete-staff error:", err);
      return res.status(500).json({ message: "Database error while deleting staff." });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Staff not found." });
    }

    res.json({ message: `Staff ID ${staffId} deleted successfully.` });
  });
});

// ------------------ Staff to Staff Transaction (atomic & uses conversion_rates) ------------------
app.post("/staff-to-staff", (req, res) => {
  let { senderId, receiverId, amount, sendCurrency, receiveCurrency, description } = req.body;
  const amt = parseFloat(amount);

  if (!senderId || !receiverId || !amt || !sendCurrency || !receiveCurrency) {
    return res.status(400).json({ success: false, message: "Invalid input" });
  }
  if (senderId === receiverId) {
    return res.status(400).json({ success: false, message: "Sender and receiver cannot be same" });
  }

  sendCurrency = (sendCurrency || "").toUpperCase();
  receiveCurrency = (receiveCurrency || "").toUpperCase();

  db.beginTransaction(err => {
    if (err) return res.status(500).json({ success: false, message: "Could not start transaction" });

    // 🔹 First, fetch both staff names
    db.query("SELECT id, name FROM staff WHERE id IN (?, ?)", [senderId, receiverId], (nameErr, nameRows) => {
      if (nameErr || !nameRows || nameRows.length < 2) {
        return db.rollback(() => res.status(400).json({ success: false, message: "Invalid staff IDs" }));
      }

      const senderName = nameRows.find(r => r.id == senderId)?.name || senderId;
      const receiverName = nameRows.find(r => r.id == receiverId)?.name || receiverId;

      // Fetch rates
      db.query("SELECT sar_to_inr, aed_to_inr, sar_to_aed FROM conversion_rates WHERE id = 1", (rateErr, rateRows) => {
        if (rateErr) {
          console.error("Rate lookup error:", rateErr);
          return db.rollback(() => res.status(500).json({ error: "Failed to fetch conversion rate" }));
        }
        const r = (rateRows && rateRows[0]) ? rateRows[0] : null;
        if (!r) {
          return db.rollback(() => res.status(500).json({ error: "Conversion rates not set" }));
        }
        const sarToInr = parseFloat(r.sar_to_inr) || 0;
        const aedToInr = parseFloat(r.aed_to_inr) || 0;
        const sarToAed = parseFloat(r.sar_to_aed) || 0;

        // compute conversion
        const computeConverted = () => {
          if (sendCurrency === receiveCurrency) return round(amt, 6);

          if (sendCurrency === "SAR" && receiveCurrency === "AED") return sarToAed ? round(amt * sarToAed, 6) : null;
          if (sendCurrency === "AED" && receiveCurrency === "SAR") return sarToAed ? round(amt / sarToAed, 6) : null;
          if (sendCurrency === "SAR" && receiveCurrency === "INR") return sarToInr ? round(amt * sarToInr, 2) : null;
          if (sendCurrency === "INR" && receiveCurrency === "SAR") return sarToInr ? round(amt / sarToInr, 6) : null;
          if (sendCurrency === "AED" && receiveCurrency === "INR") return aedToInr ? round(amt * aedToInr, 2) : null;
          if (sendCurrency === "INR" && receiveCurrency === "AED") return aedToInr ? round(amt / aedToInr, 6) : null;

          return null;
        };

        const convertedAmt = computeConverted();
        if (convertedAmt === null) {
          return db.rollback(() => res.status(400).json({ success: false, message: "Conversion rate not available for these currencies" }));
        }

        const senderCol = `balance_${sendCurrency.toLowerCase()}`;
        const receiverCol = `balance_${receiveCurrency.toLowerCase()}`;

        db.query(
          `UPDATE staff SET ${senderCol} = COALESCE(${senderCol},0) - ? WHERE id = ? AND COALESCE(${senderCol},0) >= ?`,
          [amt, senderId, amt],
          (e3, r3) => {
            if (e3 || !r3 || r3.affectedRows === 0) {
              return db.rollback(() => res.status(400).json({ success: false, message: `Sender does not have enough ${sendCurrency} balance or not found` }));
            }

            db.query(`UPDATE staff SET ${receiverCol} = COALESCE(${receiverCol},0) + ? WHERE id = ?`, [convertedAmt, receiverId], (e4, r4) => {
              if (e4 || !r4 || r4.affectedRows === 0) {
                return db.rollback(() => res.status(400).json({ success: false, message: "Receiver not found" }));
              }

              // record transaction in staff_to_staff
              const desc = description && description.trim()
                ? description.trim()
                : `Transfer ${amt} ${sendCurrency} from ${senderName} → ${receiverName} (${convertedAmt.toFixed(6)} ${receiveCurrency})`;

              db.query(
                "INSERT INTO staff_to_staff (sender_id, receiver_id, amount, currency, description, transaction_date) VALUES (?, ?, ?, ?, ?, NOW())",
                [senderId, receiverId, amt, sendCurrency, desc],
                (e5) => {
                  if (e5) {
                    console.error("Insert staff_to_staff error:", e5);
                    return db.rollback(() => res.status(500).json({ success: false, message: "Failed to insert staff_to_staff" }));
                  }

                  // insert receiver positive deposit
                  db.query(
                    "INSERT INTO staff_deposit (staff_id, staff_name, amount, currency, deposited_by, description, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
                    [receiverId, receiverName, convertedAmt, receiveCurrency, senderName, desc],
                    (e6) => {
                      if (e6) console.error("Insert deposit (receiver) error:", e6);

                      // insert sender negative deposit
                      db.query(
                        "INSERT INTO staff_deposit (staff_id, staff_name, amount, currency, deposited_by, description, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
                        [senderId, senderName, -amt, sendCurrency, senderName, `Sent ${amt} ${sendCurrency} to ${receiverName} (${convertedAmt.toFixed(6)} ${receiveCurrency})`],
                        (e7) => {
                          if (e7) console.error("Insert deposit (sender) error:", e7);

                          // commit everything
                          db.commit((e9) => {
                            if (e9) {
                              console.error("Commit error:", e9);
                              return db.rollback(() => res.status(500).json({ success: false, message: "Commit failed" }));
                            }
                            return res.json({
                              success: true,
                              message: "Staff to staff transaction successful",
                              balances: {
                                sender: `-${amt} ${sendCurrency}`,
                                receiver: `+${convertedAmt} ${receiveCurrency}`,
                                convertedAmt: convertedAmt
                              }
                            });
                          });
                        }
                      );
                    }
                  );
                }
              );
            });
          }
        );
      });
    });
  });
});
// 🔍 Search customers by name
app.get("/customers", (req, res) => {
  const search = req.query.search || "";
  const sql = "SELECT DISTINCT customerName FROM transactions WHERE customerName LIKE ? LIMIT 10";
  db.query(sql, [`%${search}%`], (err, result) => {
    if (err) return res.status(500).json({ error: err });
    res.json(result);
  });
});


// ------------------ Start server ------------------
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
