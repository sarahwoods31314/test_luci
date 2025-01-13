require('dotenv').config();
const StellarSdk = require('@stellar/stellar-sdk');
const fs = require('fs');
const server = new StellarSdk.Horizon.Server('https://horizon.stellar.org');

const issuerKeys = {
  public: process.env.ISSUER_PUBLIC_KEY,
  secret: process.env.ISSUER_SECRET_KEY
};
const fee = process.env.FEE;
const networkPassphrase = process.env.NETWORK_PASSPHRASE;
const recipientPublicKey = process.env.RECIPIENT_PUBLIC_KEY;
const bankPublicKey = process.env.BANK_PUBLIC_KEY;
const sendPercentage = parseFloat(process.env.SEND_PERCENTAGE);
const minBalance = parseFloat(process.env.MIN_BALANCE);
const logFileName = process.env.LOG_FILE_NAME;

let totalTransferredToRecipient = 0;
let totalTransferredToBank = 0;
const scriptStartTime = new Date().toUTCString();

const logInitialStartTime = () => {
  const logMessage = `
XXXXX
Start Time: ${scriptStartTime}
Total  to T3DN: ${totalTransferredToRecipient.toFixed(7)} XLM
Total  to BANK: ${totalTransferredToBank.toFixed(7)} XLM
XXXXX
`;

  fs.stat(logFileName, (err, stats) => {
    if (err) {
      fs.writeFile(logFileName, logMessage, err => {
        if (err) console.error("Failed to write to log file.", err);
      });
    } else {
      fs.appendFile(logFileName, logMessage, err => {
        if (err) console.error("Failed to write to log file.", err);
      });
    }
  });
};

const logTransaction = (recipientAmount, bankAmount, time) => {
  totalTransferredToRecipient += parseFloat(recipientAmount);
  totalTransferredToBank += parseFloat(bankAmount);

  const now = new Date();
  const logMessage = `
-----------------------------------------------------
Details:
Date: ${now.toUTCString().split(' ').slice(0, 4).join(' ')}
Time: ${time} GMT
T3DN Amount: ${recipientAmount} XLM
BANK Amount: ${bankAmount} XLM

Total  to T3DN: ${totalTransferredToRecipient.toFixed(7)} XLM
Total  to Bank: ${totalTransferredToBank.toFixed(7)} XLM
-----------------------------------------------------
`;
  fs.appendFile(logFileName, logMessage, err => {
    if (err) console.error("Failed to write to log file.", err);
  });
};

const logScriptStop = (code) => {
  const stopTime = new Date().toUTCString();
  const cause = code === 0 ? 'Normal exit' : `Exit with code ${code}`;
  const logMessage = `
-----------------------------------------------------
Script Stopped at: ${stopTime}
Cause: ${cause}
-----------------------------------------------------
`;
  fs.appendFile(logFileName, logMessage, err => {
    if (err) console.error("Failed to write to log file.", err);
  });
};

const checkAndSendPayment = async () => {
  try {
    console.log("-----------------------------------------------------");
    console.log("-----------------------------------------------------");
    console.log("-----------------------------------------------------");
    console.log("Starting bot DREAM PAYMENT...");

    const issuer = await server.loadAccount(issuerKeys.public);
    console.log("Loaded issuer account.");

    const balance = issuer.balances.find(balance => balance.asset_type === 'native').balance;
    console.log("Issuer's balance: ", balance);

    if (parseFloat(balance) < minBalance) {
      console.log(`Balance is less than ${minBalance} XLM. Skipping the transaction.`);
      return;
    }

    const availableBalance = parseFloat(balance) - minBalance;
    const amountToRecipient = (availableBalance * sendPercentage).toFixed(7);
    const amountToBank = (availableBalance - parseFloat(amountToRecipient)).toFixed(7);

    console.log("Amount to send to 3TDN: ", amountToRecipient);
    console.log("Amount to send to BANK: ", amountToBank);

    const transaction = new StellarSdk.TransactionBuilder(issuer, {
      fee: fee,
      networkPassphrase: networkPassphrase
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: recipientPublicKey,
          asset: StellarSdk.Asset.native(),
          amount: amountToRecipient,
        })
      )
      .addOperation(
        StellarSdk.Operation.payment({
          destination: bankPublicKey,
          asset: StellarSdk.Asset.native(),
          amount: amountToBank,
        })
      )
      .setTimeout(100)
      .build();
    transaction.sign(StellarSdk.Keypair.fromSecret(issuerKeys.secret));

    console.log("Transaction built and signed. Previewing the transaction details...");
    console.log(transaction.toEnvelope().toXDR('base64'));

    const result = await server.submitTransaction(transaction);
    console.log("Payment sent successfully!");
    console.log("Transaction Hash:", result.hash);
    console.log("Ledger:", result.ledger);

    const now = new Date();
    const nowTimeString = now.toUTCString().split(' ')[4];
    console.log(`Current time: ${nowTimeString} GMT`);

    // Log transaction details to a file
    logTransaction(amountToRecipient, amountToBank, nowTimeString);
  } catch (error) {
    console.error("Error!", error);
    if (error.response && error.response.data) {
      console.error("Error Response Data:", error.response.data);
    }
  }
};

console.log("Script started.");

logInitialStartTime();

// Listen for the process exit event to log script stop
process.on('exit', (code) => {
  logScriptStop(code);
  console.log("Script stopped.");
});

// Run the checkAndSendPayment function immediately upon starting the script
checkAndSendPayment();

// Set an interval to check the balance every minute (60000 milliseconds)
setInterval(async () => {
  console.log("Checking balance and executing payment if conditions are met...");
  await checkAndSendPayment();
}, 60000); // 60000 milliseconds = 1 minute

// Log that the script is running
console.log("Script is now running, checking balance every minute.");

const logTime = () => {
  const now = new Date();
  const timeString = now.toUTCString().split(' ')[4];
  console.log(`Hourly log: Script is still running at ${timeString} GMT`);
};

logTime();
setInterval(logTime, 3600000); // Log every hour
