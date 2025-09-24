const API_URL = "http://localhost:3000";

let filteredTransactions = [];
let currentCustomerName = "";

// --- Single, robust formatDate used everywhere ---
function formatDate(dateStr) {
  if (!dateStr) return "-";
  // MySQL often returns "YYYY-MM-DD HH:mm:ss" — convert safely to ISO-like string
  let safe = dateStr;
  if (typeof safe === "string" && safe.indexOf(" ") === 10 && safe.indexOf("T") === -1) {
    safe = safe.replace(" ", "T");
  }
  const d = new Date(safe);
  if (isNaN(d)) return dateStr;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: true
  }).format(d);
}

function showMessage(message, isError = false) {
  // keep simple (you can replace with custom UI later)
  alert(message);
}

function validateInput(inputElement) {
  if (!inputElement.value || !inputElement.value.toString().trim()) {
    inputElement.style.border = "2px solid red";
    return false;
  }
  inputElement.style.border = "";
  return true;
}

// ---------------- Add Staff ----------------
async function addStaff() {
  const staffId = document.getElementById("staffId").value.trim();
  const staffName = document.getElementById("staffName").value.trim();
  if (!validateInput(document.getElementById("staffId")) || !validateInput(document.getElementById("staffName"))) return;

  try {
    const resp = await fetch(API_URL + "/add-staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId, staffName })
    });
    const result = await resp.json();
    showMessage(result.message || "Staff added");
    displayStaffDetails();
    document.getElementById("staffId").value = "";
    document.getElementById("staffName").value = "";
  } catch (err) {
    console.error("addStaff error:", err);
    showMessage("Server error while adding staff", true);
  }
}

// ---------------- Add Deposit ----------------
async function addDeposit() {
  const staffId = document.getElementById("depositStaffId").value.trim();
  const staffName = document.getElementById("depositStaffName").value.trim();
  const amount = parseFloat(document.getElementById("depositAmount").value);
  const currency = document.getElementById("depositCurrency").value;
  const description = ""; // optionally add a description input later

  if (!validateInput(document.getElementById("depositStaffId")) || isNaN(amount) || amount <= 0) {
    alert("Please enter valid deposit details.");
    return;
  }

  try {
    const response = await fetch(API_URL + "/add-deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId, staffName, amount, currency, description, depositedBy: "Admin" })
    });
    const result = await response.json();
    showMessage(result.message || "Deposit added");
    displayStaffDetails();

    document.getElementById("depositStaffId").value = "";
    document.getElementById("depositStaffName").value = "";
    document.getElementById("depositAmount").value = "";
  } catch (err) {
    console.error("addDeposit error:", err);
    showMessage("Server error while adding deposit", true);
  }
}

// ---------------- Display Staff details (small summary) ----------------
async function displayStaffDetails() {
  try {
    const res = await fetch(API_URL + "/get-staff");
    const staffList = await res.json();
    const container = document.getElementById("staffBalanceDisplay");

    if (!Array.isArray(staffList) || staffList.length === 0) {
      container.innerHTML = "<p>No staff found</p>";
      return;
    }

    container.innerHTML = `
      <table border="1" cellspacing="0" cellpadding="8" style="border-collapse: collapse; width: 100%; text-align: center;">
        <thead style="background: #f4f4f4;">
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Balances</th>
          </tr>
        </thead>
        <tbody>
          ${staffList.map(staff => {
            const inr = `${parseFloat(staff.balance_inr || 0).toFixed(2)} INR`;
            const sar = `${parseFloat(staff.balance_sar || 0).toFixed(2)} SAR`;
            const aed = `${parseFloat(staff.balance_aed || 0).toFixed(2)} AED`;

            const sarConv = staff.converted_inr_from_sar && staff.converted_inr_from_sar > 0 
              ? `\\ ${staff.converted_inr_from_sar} (CD)INR` 
              : "";
            const aedConv = staff.converted_inr_from_aed && staff.converted_inr_from_aed > 0 
              ? `\\ ${staff.converted_inr_from_aed} (CD)INR` 
              : "";

            return `
              <tr>
                <td>${staff.id}</td>
                <td>${staff.name}</td>
                <td>
                  ${inr} <br>
                  ${sar}${sarConv} <br>
                  ${aed}${aedConv}
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error("displayStaffDetails error:", err);
    document.getElementById("staffBalanceDisplay").innerHTML = "<p>Error loading staff details</p>";
  }
}



// ---------------- Add Expense ----------------
function addExpense() {
  const staffId = document.getElementById('expense_staff_id').value.trim();
  const staffName = document.getElementById('staff_name').value.trim();
  const amount = document.getElementById('expense_amount').value.trim();
  const reason = document.getElementById('expense_reason').value.trim();

  if (!staffId || !staffName || !amount || !reason) {
    alert("Please fill all fields!");
    return;
  }

  // Ask user to choose currency
  const currency = prompt("Enter Currency (INR / AED / SAR):");
  if (!currency || !["INR", "AED", "SAR"].includes(currency.toUpperCase())) {
    alert("❌ Invalid currency! Must be INR, AED, or SAR.");
    return;
  }

  let payload = { staffId, staffName, amount, reason, currency: currency.toUpperCase() };

  // 🟢 Special case: Admin Expense
  if (staffName.toLowerCase() === "admin") {
    const deductedFromStaffId = prompt("Enter Staff ID to deduct this Admin expense from:");
    if (!deductedFromStaffId) {
      alert("You must enter a staff ID to deduct from.");
      return;
    }
    payload.deductedFromStaffId = deductedFromStaffId;
  }

  fetch(API_URL + '/add-expense', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert("✅ " + data.message);
      document.getElementById('expense_staff_id').value = '';
      document.getElementById('staff_name').value = '';
      document.getElementById('expense_amount').value = '';
      document.getElementById('expense_reason').value = '';
      displayStaffDetails();
    } else {
      alert("❌ " + (data.message || "Failed to add expense"));
    }
  })
  .catch(error => {
    console.error("Fetch Error:", error);
    alert("❌ Server error while adding expense.");
  });
}

// ---------------- Search Transaction (table-based search + deposit special) ----------------
async function searchTransaction() {
  let searchInput = document.getElementById("searchInput").value.trim().toLowerCase();
  let resultsContainer = document.getElementById("searchResultsContainer");

  resultsContainer.innerHTML = "";
  filteredTransactions = [];
  currentCustomerName = "";

  // Special: deposit <id>
  if (searchInput.startsWith("deposit ")) {
    let staffId = searchInput.replace("deposit ", "").trim();
    if (!staffId) {
      alert("❌ Please enter a valid staff ID after 'deposit'.");
      return;
    }

    fetch(`${API_URL}/staff-deposits/${staffId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          let resultHTML = `
            <h3>🧾 Deposit Records for Staff ID: ${staffId}</h3>
            <table border="1" width="100%">
              <thead>
                <tr><th>Deposit Amount</th><th>Currency</th><th>Description</th><th>Deposited By</th><th>Date</th></tr>
              </thead>
              <tbody>`;
          data.deposits.forEach(dep => {
            resultHTML += `<tr>
              <td>${dep.amount}</td>
              <td>${dep.currency || 'INR'}</td>
              <td>${dep.description || '-'}</td>
              <td>${dep.deposited_by || '-'}</td>
              <td>${formatDate(dep.deposit_date)}</td>
            </tr>`;
          });
          resultHTML += `</tbody></table>`;
          resultsContainer.innerHTML = resultHTML;
          document.getElementById("searchResultModal").style.display = "block";
        } else {
          alert("❌ " + data.message);
        }
      })
      .catch(err => {
        console.error("Error fetching deposits:", err);
        alert("❌ Server error while fetching deposit data.");
      });

    return;
  }

  // For non-deposit searches: ensure transactions table is freshly loaded
  await loadTransactions();

  let tableRows = document.getElementById("transactionsTable").getElementsByTagName("tr");

  // get optional date range
  const fromDateInput = document.getElementById("fromDate").value;
  const toDateInput = document.getElementById("toDate").value;
  const fromDate = fromDateInput ? new Date(fromDateInput) : null;
  const toDate = toDateInput ? new Date(toDateInput) : null;
  if (toDate) toDate.setHours(23, 59, 59, 999);

  let found = false;
  let resultHTML = "";

  for (let i = 0; i < tableRows.length; i++) {
    const row = tableRows[i];
    const cells = row.getElementsByTagName("td");
    if (cells.length < 9) continue;

    const staffId = cells[0]?.textContent.trim();
    const staffName = cells[1]?.textContent.trim();
    const customerName = cells[2]?.textContent.trim();
    const amountSent = cells[3]?.textContent.trim();
    const receivedAmount = cells[4]?.textContent.trim();
    const convertedAmount = cells[5]?.textContent.trim();
    const sendCountry = cells[6]?.textContent.trim();
    const customerBalance = cells[7]?.textContent.trim();
    const dateText = cells[8]?.getAttribute('data-date') || cells[8]?.textContent.trim();
    const rowDate = new Date(dateText);

    const matchDate = (!fromDate || rowDate >= fromDate) && (!toDate || rowDate <= toDate);

    // ✅ Exact match for staffId, staffName, and customerName
    const matchSearch =
      (staffId && staffId.toLowerCase() === searchInput) ||
      (staffName && staffName.toLowerCase() === searchInput) ||
      (customerName && customerName.toLowerCase() === searchInput);

    if (matchSearch && matchDate) {
      found = true;
      currentCustomerName = customerName;

      filteredTransactions.push({
        staffId, staffName, customerName, amountSent, receivedAmount,
        convertedAmount, sendCountry, customerBalance, date: dateText
      });

      resultHTML += `
        <tr>
          <td>${staffId}</td>
          <td>${staffName}</td>
          <td>${customerName}</td>
          <td>${amountSent}</td>
          <td>${receivedAmount}</td>
          <td>${convertedAmount}</td>
          <td>${sendCountry}</td>
          <td>${customerBalance}</td>
          <td>${formatDate(dateText)}</td>
        </tr>`;
    }
  }

  if (found) {
    document.getElementById("searchResultModal").style.display = "block";
    resultsContainer.innerHTML = `
      <table border="1" width="100%">
        <thead>
          <tr>
            <th>Staff ID</th><th>Staff Name</th><th>Customer Name</th><th>Amount Sent</th><th>Received</th>
            <th>Converted</th><th>Send Country</th><th>Customer Balance</th><th>Date</th>
          </tr>
        </thead>
        <tbody>${resultHTML}</tbody>
      </table>`;
  } else {
    alert("❌ No transactions found.");
  }
}

function closeModal() {
  document.getElementById("searchResultModal").style.display = "none";
}
//------------- search expense--------------
function searchExpense() {
  const staffName = document.getElementById('search_staff_name').value.trim();
  if (!staffName) { alert("Please enter a Staff Name"); return; }

  fetch(`${API_URL}/get-staff-expenses/${encodeURIComponent(staffName)}`)
    .then(res => res.json())
    .then(data => {
      if (data.success && data.expenses.length > 0) {
        let tbody = document.querySelector("#expensetable tbody");
        tbody.innerHTML = "";
        data.expenses.forEach(exp => {
  tbody.innerHTML += `
  <tr>
    <td>${exp.staffId || ''}</td>
    <td>${exp.staff_name || ''}</td>
    <td>${exp.amount}</td>
    <td>${exp.reason}</td>
    <td>${formatDate(exp.date)}</td>
    <td>${exp.deducted_from_name ? exp.deducted_from_name + " (ID: " + exp.deducted_from_staff + ")" : '-'}</td>
    <td>${exp.currency || '-'}</td>
  </tr>`;
});
        document.getElementById("searchExpenseModal").style.display = "block";
      } else {
        alert("No expenses found for this staff.");
      }
    })
    .catch(err => {
      console.error("Error fetching staff expenses:", err);
      alert("Server error while fetching staff expenses.");
    });
}

function closeExpenseModal() {
  document.getElementById("searchExpenseModal").style.display = "none";
}

// ---------------- Set Rates ----------------
async function setRates() {
  const sarToInr = parseFloat(document.getElementById("sarRate").value);
  const aedToInr = parseFloat(document.getElementById("aedRate").value);
  const sarToAed = parseFloat(document.getElementById("sarToAedRate").value);

  if (isNaN(sarToInr) || sarToInr <= 0 ||
      isNaN(aedToInr) || aedToInr <= 0 ||
      isNaN(sarToAed) || sarToAed <= 0) {
    alert("Enter valid rates");
    return;
  }

  const response = await fetch(API_URL + "/set-rates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sarToInr, aedToInr, sarToAed })   // ✅ send sarToAed also
  });

  const result = await response.json();
  showMessage(result.message || "Rates updated");
  displayCurrencyRates();
}


// ---------------- Convert amount (on select) ----------------
// ---------------- Convert amount (on select) ----------------
// Corrected convertAmount()
async function convertAmount() {
  const amountInput = document.getElementById("amountSent");
  const countrySelect = document.getElementById("sendCountry"); // the target currency selection in your UI
  const convertedInput = document.getElementById("convertedCurrency");

  const amount = parseFloat(amountInput.value);
  const country = countrySelect.value;

  if (isNaN(amount) || amount <= 0) {
    convertedInput.value = "";
    return;
  }

  try {
    const response = await fetch(API_URL + "/get-rates");
    const data = await response.json();

    // parse numeric rates (protect against strings/null)
    const sarToInr = parseFloat(data.sar_to_inr) || 0;
    const aedToInr = parseFloat(data.aed_to_inr) || 0;
    const sarToAed = parseFloat(data.sar_to_aed) || 0;

    let converted;

    // amount is INR; convert to chosen currency
    if (country === "SAR") {
      if (!sarToInr) throw new Error("SAR→INR rate missing");
      converted = amount / sarToInr;        // INR -> SAR
    } else if (country === "AED") {
      if (!aedToInr) throw new Error("AED→INR rate missing");
      converted = amount / aedToInr;        // INR -> AED
    } else if (country === "SAR-AED") {
      // this mode expects you to be converting SAR to AED (if UI supports it).
      // If user is entering INR this won't be meaningful — keep only if you actually expect SAR→AED conversion here.
      if (!sarToAed) throw new Error("SAR→AED rate missing");
      converted = amount * sarToAed;       // SAR -> AED (amount is assumed SAR in this branch)
    } else {
      // fallback (INR)
      converted = amount;
    }

    convertedInput.value = (!isFinite(converted) ? "" : converted.toFixed(2));
  } catch (err) {
    console.error("Conversion Error:", err);
    convertedInput.value = "";
  }
}


// ---------------- Send Money ----------------
async function sendMoney() {
  const staffId = document.getElementById("transferStaffId").value.trim();
  const staffName = document.getElementById("transferStaffName").value.trim();
  const customerName = document.getElementById("customerName").value.trim();
  const amountSent = parseFloat(document.getElementById("amountSent").value);
  const receivedMoney = parseFloat(document.getElementById("receivedMoney").value);
  const currency = document.getElementById("receivedCurrency").value;
  const sendCountry = document.getElementById("sendCountry").value;
  const transactionDate = document.getElementById("transferDate").value;
  const description = document.getElementById("transferDescription").value.trim(); // ✅ new

  if (
    !validateInput(document.getElementById("transferStaffId")) ||
    !validateInput(document.getElementById("customerName")) ||
    isNaN(amountSent) || amountSent < 0 ||
    isNaN(receivedMoney) || receivedMoney < 0
  ) {
    alert("Please fill valid transaction details.");
    return;
  }

  const payload = { 
    staffId, 
    staffName, 
    customerName, 
    amountSent, 
    receivedMoney, 
    currency, 
    sendCountry, 
    transactionDate: transactionDate || null,
    description  // ✅ include description in payload
  };

  try {
    const response = await fetch(API_URL + "/send-money", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    showMessage(result.message || "Transaction saved");
    loadTransactions();
    displayStaffDetails();

    // clear inputs
    document.getElementById("transferStaffId").value = '';
    document.getElementById("transferStaffName").value = '';
    document.getElementById("customerName").value = '';
    document.getElementById("amountSent").value = '';
    document.getElementById("receivedMoney").value = '';
    document.getElementById("convertedCurrency").value = '';
    document.getElementById("sendCountry").selectedIndex = 0;
    document.getElementById("transferDate").value = '';
    document.getElementById("receivedCurrency").selectedIndex = 0;
    document.getElementById("transferDescription").value = ''; // ✅ clear description
  } catch (err) {
    console.error("Send Money Error:", err);
    showMessage("❌ Failed to connect to server.");
  }
}


// ---------------- Load transactions ----------------
// ---------------- Load transactions ----------------
async function loadTransactions() {
  try {
    const response = await fetch(API_URL + "/transactions");
    const data = await response.json();
    const transactions = Array.isArray(data) ? data : [];

    // sort oldest → newest
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    const rows = transactions.map(tx => {
      const rawDate = tx.date;
      const displayDate = formatDate(rawDate);

      // amount sent
      const amountSent = (tx.amountSent !== undefined && tx.amountSent !== null)
        ? `${Number(tx.amountSent).toFixed(2)} INR`
        : "-";

      // received money
      const receivedMoney = (tx.receivedMoney !== undefined && tx.receivedMoney !== null)
        ? `${Number(tx.receivedMoney).toFixed(2)} ${tx.currency || ""}`
        : "-";

      // converted amount
      const convertedForeignNum = Number(tx.convertedAmountForeign || 0);
      const convertedInrNum = Number(tx.convertedAmount || 0);

      const sc = (tx.sendCountry || "").toString();
      const sarToAedFlag = /sar[-_ ]?aed|sar_to_aed|sartoaed|sar_aed/i.test(sc);

      let convertedValue = 0;
      let convertedCurrency = "INR";

      if (convertedForeignNum && !isNaN(convertedForeignNum) && convertedForeignNum !== 0) {
        convertedValue = convertedForeignNum;
        if (sarToAedFlag) {
          convertedCurrency = "AED";
        } else if (sc.toUpperCase().includes("SAR")) {
          convertedCurrency = "SAR";
        } else if (sc.toUpperCase().includes("AED")) {
          convertedCurrency = "AED";
        } else {
          convertedCurrency = tx.currency || "AED";
        }
      } else {
        convertedValue = convertedInrNum;
        convertedCurrency = "INR";
      }

      // balances
      const inrBalanceNum = tx.balances && tx.balances.inr !== undefined ? Number(tx.balances.inr) : 0;
      const balanceInr = `${inrBalanceNum.toFixed(2)} INR`;

      let balanceForeign = "-";
      if (tx.balances && tx.balances.foreign !== undefined && tx.balances.foreign !== null) {
        const rawForeign = tx.balances.foreign;
        if (typeof rawForeign === "number") {
          let foreignCurrencyLabel = tx.currency || (sc.includes("AED") ? "AED" : (sc.includes("SAR") ? "SAR" : ""));
          balanceForeign = `${rawForeign} ${foreignCurrencyLabel}`;
        } else {
          balanceForeign = String(rawForeign).trim();
        }
      }

      // description
      const description = tx.description
        ? `<span title="${tx.description}" style="display:inline-block; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${tx.description}</span>`
        : "-";

      // ✅ conversion rate display
      let conversionRateDisplay = "-";
      if (tx.conversionRates) {
        if (convertedCurrency === "AED") {
          conversionRateDisplay = `1 AED = ${tx.conversionRates.AED_to_INR} INR`;
        } else if (convertedCurrency === "SAR") {
          conversionRateDisplay = `1 SAR = ${tx.conversionRates.SAR_to_INR} INR`;
        } else if (sarToAedFlag) {
          conversionRateDisplay = `1 SAR = ${tx.conversionRates.SAR_to_AED} AED`;
        }
      }

      return `<tr>
        <td>${tx.staffId || ""}</td>
        <td>${tx.staffName || ""}</td>
        <td>${tx.customerName || ""}</td>
        <td>${amountSent}</td>
        <td>${receivedMoney}</td>
        <td>${(isFinite(convertedValue) ? Number(convertedValue).toFixed(2) : "-")} ${convertedCurrency}</td>
        <td>${conversionRateDisplay}</td>
        <td>${tx.sendCountry || ""}</td>
        <td>${balanceInr}<br>${balanceForeign}</td>
        <td data-date="${rawDate}">${displayDate}</td>
        <td>${description}</td>
        <td><button onclick="deleteTransaction(${tx.id})">Delete</button></td>
      </tr>`;
    }).join("");

    const tbodyEl = document.getElementById("transactionsTable");
    if (tbodyEl) {
      tbodyEl.innerHTML = rows || "<tr><td colspan='12'>No transactions</td></tr>";
    } else {
      console.warn("transactionsTable element not found");
    }
  } catch (err) {
    console.error("loadTransactions error:", err);
  }
}


// ---------------- Delete transaction ----------------
async function deleteTransaction(id) {
  if (!confirm("Delete this transaction?")) return;
  await fetch(`${API_URL}/delete-transaction/${id}`, { method: "DELETE" });
  showMessage("Transaction deleted.");
  loadTransactions();
}

async function exportCSV() {
  const searchRaw = document.getElementById("searchInput")?.value || "";
  const searchValue = searchRaw.trim().toLowerCase();
  const fromDateInput = document.getElementById("fromDate")?.value;
  const toDateInput = document.getElementById("toDate")?.value;
  const fromDate = fromDateInput ? new Date(fromDateInput) : null;
  const toDate = toDateInput ? new Date(toDateInput) : null;
  if (toDate) toDate.setHours(23, 59, 59, 999);

  const isSarToAedFlag = (sendCountry) => {
    if (!sendCountry) return false;
    return /sar[-_ ]?aed|sar_to_aed|sartoaed|sar_aed/i.test(sendCountry.toString());
  };

  try {
    // ---------------- Deposit export ----------------
    if (searchValue.startsWith("deposit ")) {
      const staffId = searchRaw.trim().split(/\s+/)[1];
      if (!staffId) { alert("Enter a staff id after 'deposit'"); return; }

      const resp = await fetch(`${API_URL}/staff-deposits/${encodeURIComponent(staffId)}`);
      const data = await resp.json();
      if (!data.success || !Array.isArray(data.deposits)) {
        alert("❌ No deposit data found.");
        return;
      }

      const filtered = data.deposits.filter(d => {
        const dDate = new Date(d.deposit_date);
        return (!fromDate || dDate >= fromDate) && (!toDate || dDate <= toDate);
      });

      if (filtered.length === 0) { alert("❌ No deposits found in selected date range."); return; }

      const formatted = filtered.map((dep, i) => ({
        "Sr No.": i + 1,
        "Staff ID": staffId,
        "Staff Name": dep.staff_name || "",
        "Deposit Amount": `${Number(dep.amount || 0).toFixed(2)} ${dep.currency || "INR"}`,
        "Currency": dep.currency || "INR",
        "Deposited By": dep.deposited_by || "Admin",
        "Description": dep.description || "",
        "Deposit Date": formatDate(dep.deposit_date)
      }));

      const ws = XLSX.utils.json_to_sheet(formatted);
      ws['!cols'] = [{wch:6},{wch:10},{wch:18},{wch:18},{wch:10},{wch:18},{wch:30},{wch:22}];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Staff_${staffId}_Deposits`);
      XLSX.writeFile(wb, `staff_${staffId}_deposits.xlsx`);
      return;
    }

    // ---------------- Transactions export ----------------
    const resp = await fetch(`${API_URL}/transactions`);
    const data = await resp.json();
    if (!Array.isArray(data)) {
      alert("Invalid data received from server.");
      return;
    }

    let filtered = data;
    if (searchValue && searchValue !== "get all") {
      filtered = filtered.filter(tx =>
        (tx.customerName && tx.customerName.toString().toLowerCase().includes(searchValue)) ||
        (tx.staffId && tx.staffId.toString().includes(searchValue))
      );
    }

    filtered = filtered.filter(tx => {
      const txDate = new Date(tx.date || tx.timestamp || tx.createdAt || tx['date']);
      return (!fromDate || txDate >= fromDate) && (!toDate || txDate <= toDate);
    });

    if (filtered.length === 0) { alert("❌ No transactions found in selected date range."); return; }

    const formatted = filtered.map(tx => {
      const amountSentNum = Number(tx.amountSent || 0);
      const receivedNum = Number(tx.receivedMoney || 0);

      // ---------------- Converted amount fix ----------------
      const convertedForeign = Number(tx.convertedAmountForeign || 0);
      const convertedInr = Number(tx.convertedAmount || 0);

      const sc = (tx.sendCountry || "").toString();
      const sarToAed = isSarToAedFlag(sc);

      // If backend provided convertedAmountForeign, always use it
      let convertedValue, convertedCurrency;
      if (convertedForeign && !isNaN(convertedForeign) && convertedForeign !== 0) {
        convertedValue = convertedForeign;
        if (sarToAed) {
          convertedCurrency = "AED";
        } else if (sc && sc.toUpperCase().includes("SAR")) {
          convertedCurrency = "SAR";
        } else if (sc && sc.toUpperCase().includes("AED")) {
          convertedCurrency = "AED";
        } else {
          convertedCurrency = tx.currency || "AED";
        }
      } else {
        convertedValue = convertedInr;
        convertedCurrency = (tx.currency && tx.currency.toString()) ? (tx.currency.toString() === "INR" ? "INR" : (tx.currency.toString())) : "INR";
        // fallback keep INR if nothing else
        if (!convertedCurrency) convertedCurrency = "INR";
      }

      // ---------------- Received currency ----------------
      const receivedCurrency = (tx.currency && tx.currency.toString())
        ? tx.currency.toString()
        : (sc.toUpperCase().includes("AED") ? "AED" : (sc.toUpperCase().includes("SAR") ? "SAR" : "INR"));

      // ---------------- Customer balances ----------------
      let foreignBalanceVal = 0;
      let foreignBalanceCurrency = receivedCurrency;
      if (tx.balances && tx.balances.foreign !== undefined && tx.balances.foreign !== null) {
        if (typeof tx.balances.foreign === "number") {
          foreignBalanceVal = tx.balances.foreign;
        } else {
          const txt = tx.balances.foreign.toString();
          const m = txt.match(/(-?\d[\d,\.]*)\s*([A-Za-z]*)/);
          if (m) {
            foreignBalanceVal = parseFloat(m[1].replace(/,/g, "")) || 0;
            if (m[2]) foreignBalanceCurrency = m[2];
          } else {
            foreignBalanceVal = parseFloat(txt.replace(/,/g, "")) || 0;
          }
        }
      }

      return {
        "Staff ID": tx.staffId || "",
        "Staff Name": tx.staffName || "",
        "Customer Name": tx.customerName || "",
        "Amount Sent (INR)": `${amountSentNum.toFixed(2)} INR`,
        "Received Money": `${receivedNum.toFixed(2)} ${receivedCurrency}`,
        "Converted Amount": `${(isFinite(convertedValue) ? convertedValue.toFixed(2) : "0.00")} ${convertedCurrency}`, // ✅ fixed
        "Send To": tx.sendCountry || "",
        "Customer Balance (INR)": `${(Number(tx.balances?.inr || 0)).toFixed(2)} INR`,
        "Customer Balance (Foreign)": `${foreignBalanceVal.toFixed(2)} ${foreignBalanceCurrency}`,
        "Description": tx.description || "",
        "Date & Time": formatDate(tx.date || tx.timestamp || tx.createdAt || Date.now())
      };
    });

    const ws = XLSX.utils.json_to_sheet(formatted);
    ws['!cols'] = [
      {wch:10}, {wch:18}, {wch:22}, {wch:18}, {wch:18},
      {wch:18}, {wch:12}, {wch:20}, {wch:22}, {wch:30}, {wch:25}
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");

    let filename = "all_transactions.xlsx";
    if (searchValue && searchValue !== "get all") {
      filename = `${searchValue.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "")}_transactions.xlsx`;
    }

    XLSX.writeFile(wb, filename);
  } catch (err) {
    console.error("Export Error", err);
    alert("❌ Failed to export data. See console for details.");
  }
}


// ---------------- Fetch staff name into inputs ----------------
async function fetchStaffDetails(staffIdInputId, staffNameInputId) {
  const staffId = document.getElementById(staffIdInputId).value.trim();
  if (!staffId) return;
  try {
    const response = await fetch(`${API_URL}/staff/${staffId}`);
    if (!response.ok) throw new Error("Staff not found");
    const staff = await response.json();
    if (staff && staff.name) {
      document.getElementById(staffNameInputId).value = staff.name;
    } else {
      document.getElementById(staffNameInputId).value = "";
      showMessage("Staff not found!", true);
    }
  } catch (err) {
    console.error("fetchStaffDetails error:", err);
    document.getElementById(staffNameInputId).value = "";
  }
}

// ---------------- Display currency rates ----------------
function displayCurrencyRates() {
  fetch(`${API_URL}/get-rates`)
    .then(res => res.json())
    .then(data => {
      const currencyText = `💱 Latest Rates: AED ₹${data.aed_to_inr || "-"} | SAR ₹${data.sar_to_inr || "-"} | SAR ${data.sar_to_aed || "-"} AED`;
      document.getElementById("currencyRates").innerText = currencyText;
    })
    .catch(err => {
      console.error("Failed to load currency rates:", err);
      document.getElementById("currencyRates").innerText = "💱 Latest Rates: Error fetching rates";
    });
}


// ---------------- Delete staff ----------------
function deleteStaff() {
  const staffId = document.getElementById("deleteStaffId").value.trim();
  if (!staffId) { alert("Please enter a staff ID."); return; }
  if (!confirm(`Are you sure you want to delete staff ID ${staffId}?`)) return;
  fetch(`${API_URL}/delete-staff/${staffId}`, { method: "DELETE" })
    .then(res => res.json())
    .then(data => {
      alert(data.message || "Deleted");
      document.getElementById("deleteStaffId").value = '';
      displayStaffDetails();
    })
    .catch(err => {
      console.error("Error deleting staff:", err);
      alert("❌ Failed to delete staff.");
    });
}

// ---------------- get staff details (for left panel display) ----------------
async function getStaffDetails(staffId, targetDiv) {
  if (!staffId) return;
  try {
    const res = await fetch(`${API_URL}/staff/${staffId}`);
    if (!res.ok) throw new Error("Staff not found");
    const data = await res.json();
    document.getElementById(targetDiv).innerText =
      `Name: ${data.name}, INR: ${data.balance_inr || 0}`;
  } catch (err) {
    document.getElementById(targetDiv).innerText = "Staff not found";
  }
}

// ---------------- Staff to Staff Transaction (frontend call) ----------------
async function staffToStaffTransaction() {
  const senderId = document.getElementById("senderId").value.trim();
  const receiverId = document.getElementById("receiverId").value.trim();
  const amount = parseFloat(document.getElementById("transferAmount").value);
  const sendCurrency = document.getElementById("sendCurrency").value;
  const receiveCurrency = document.getElementById("receiveCurrency").value;
  const description = document.getElementById("description").value.trim();

  if (!senderId || !receiverId || isNaN(amount) || amount <= 0) {
    alert("Enter valid details for staff-to-staff transfer.");
    return;
  }

  if (senderId === receiverId) {
    alert("Sender and receiver cannot be the same.");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/staff-to-staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId, receiverId, amount, sendCurrency, receiveCurrency, description })
    });

    const data = await res.json();

    if (data.success && data.balances) {
      // handle balances being numbers or strings
      const senderBalRaw = data.balances.sender ?? data.balances.inr ?? data.balances.inrBalance ?? 0;
      const receiverBalRaw = data.balances.receiver ?? data.balances.foreign ?? 0;
      const convertedAmtRaw = data.balances.convertedAmt ?? data.balances.convertedForeign ?? 0;

      const senderBalance = (Number(senderBalRaw) || 0).toFixed(2);
      const receiverBalance = (Number(receiverBalRaw) || 0).toFixed(2);
      const convertedAmt = (Number(convertedAmtRaw) || 0).toFixed(2);

      let message = `Transfer Successful!\nSender new balance: ${senderBalance} ${sendCurrency}\n`;
      message += `Receiver new balance: ${receiverBalance} ${receiveCurrency}`;
      if (sendCurrency !== receiveCurrency) {
        message += ` (Converted: ${convertedAmt} ${receiveCurrency})`;
      }
      alert(message);
    } else {
      alert(data.message || "Transfer failed");
    }

    displayStaffDetails(); // refresh staff list
    loadTransactions();
  } catch (err) {
    console.error("staffToStaffTransaction error:", err);
    alert("Error performing staff to staff transaction");
  }
} // ✅ this closing brace was missing in your code


// ---------------- Close deposit modal ----------------
function closeDepositModal() {
  document.getElementById("searchDepositModal").style.display = "none";
}



// ---------------- On page load (single handler) ----------------
window.addEventListener('DOMContentLoaded', () => {
  displayCurrencyRates();
  loadTransactions();
  displayStaffDetails();

  // ensure modals hidden initially
  const modalIds = ["searchResultModal", "searchExpenseModal", "searchDepositModal"];
  modalIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
});
// ------ customer suggestion----------
document.getElementById("customerName").addEventListener("input", async function() {
  const query = this.value.trim();
  if (query.length < 1) return; // don’t search empty

  try {
    const res = await fetch(API_URL + "/customers?search=" + encodeURIComponent(query));
    const data = await res.json();

    const datalist = document.getElementById("customerSuggestions");
    datalist.innerHTML = ""; // clear old suggestions

    data.forEach(c => {
      const option = document.createElement("option");
      option.value = c.customerName;
      datalist.appendChild(option);
    });
  } catch (err) {
    console.error("Error fetching suggestions:", err);
  }
});