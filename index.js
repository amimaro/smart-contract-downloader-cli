#!/usr/bin/env node

const inquirer = require("inquirer");
const fs = require("fs");
const getDirName = require("path").dirname;

const isSingleFileContract = (sourceCode) => {
  return (
    sourceCode.indexOf("pragma") === 0 ||
    sourceCode.indexOf("//") === 0 ||
    sourceCode.indexOf("\r\n") === 0 ||
    sourceCode.indexOf("/*") === 0
  );
};

const isSymbolObject = (network) => {
  return network.indexOf("bsc") >= 0;
};

const isJsonString = (str) => {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
};

const parseSourceCodeObject = (sourceCode, network) => {
  if (isSymbolObject(network)) {
    const doubleCurlyBracesPattern = /^[{]{2}(.|\r\n)*[}]{2}$/gm;
    if (doubleCurlyBracesPattern.test(sourceCode)) {
      sourceCode = sourceCode.substring(1, sourceCode.length - 1);
      return JSON.parse(sourceCode).sources;
    }
    return JSON.parse(sourceCode);
  } else if (isJsonString(sourceCode)) {
    return JSON.parse(sourceCode);
  }
  return JSON.parse(sourceCode.substr(1, sourceCode.length - 2));
};

const getSourcesObject = (parsedSourceCode, network) => {
  if (isSymbolObject(network)) return Object.entries(parsedSourceCode);
  if (parsedSourceCode.hasOwnProperty("sources")) {
    return Object.entries(parsedSourceCode.sources);
  }
  return Object.entries(parsedSourceCode);
};

const getContractContentList = (sourceCodes, network) => {
  const contractContent = [];
  for (const sourceCode of sourceCodes) {
    if (isSingleFileContract(sourceCode.SourceCode)) {
      contractContent.push({
        path: "contract.sol",
        content: sourceCode.SourceCode,
      });
    } else {
      const parsedSourceCode = parseSourceCodeObject(
        sourceCode.SourceCode,
        network
      );
      const sourceObjects = getSourcesObject(parsedSourceCode, network).map(
        (sourceObject) => {
          return {
            path: sourceObject[0],
            content: sourceObject[1].content,
          };
        }
      );
      contractContent.push(...sourceObjects);
    }
  }
  return contractContent;
};

async function getNetworks() {
  try {
    const response = await fetch(
      "https://smart-contract-downloader.vercel.app/api/networks"
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("An error occurred:", error);
    return [];
  }
}

async function downloadSmartContract() {
  const networks = await getNetworks();
  if (networks.length === 0) {
    console.error("No networks found");
    return;
  }
  const networkLabels = networks.map((network) => network.label);
  try {
    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "networkInput",
        message: "Select the network chain:",
        choices: networkLabels,
      },
      {
        type: "input",
        name: "contractIdInput",
        message: "Enter the contract ID:",
        required: true,
      },
    ]);

    const { networkInput, contractIdInput } = answers;

    const testContractId = "";
    const contractId = contractIdInput || testContractId;

    const networkKey = networks.find(
      (network) => network.label === networkInput
    ).key;

    if (!networkKey) {
      console.error("Invalid network");
      return;
    }
    if (contractId.length !== 42) {
      console.error("Invalid contract ID");
      return;
    }

    console.log(`Downloading smart contract for network: ${networkInput}`);
    console.log(`Contract ID: ${contractId}`);

    const response = await fetch(
      `https://smart-contract-downloader.vercel.app/api/contract/${networkKey}/${contractId}`
    );

    const data = await response.json();
    if (typeof data.result === "string") {
      console.error("An error occurred:", data.result);
      return;
    }

    const sourceCodes = data.result;
    if (sourceCodes === "Invalid API Key" || sourceCodes[0].SourceCode === "") {
      console.error("Invalid API Key");
      return;
    }
    const contractContents = getContractContentList(sourceCodes, networkKey);

    const contractFolderName = `contract_${networkKey}_${contractId}`;
    if (fs.existsSync(contractFolderName)) {
      console.error(
        `Contract folder already exists: ${contractFolderName}. Please delete the folder and try again.`
      );
      return;
    }
    fs.mkdirSync(contractFolderName);
    for (const contractContent of contractContents) {
      const filePath = `${contractFolderName}/${contractContent.path}`;
      const fileContent = contractContent.content;
      const dir = getDirName(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, fileContent);
    }

    console.log("Smart contract downloaded successfully");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

downloadSmartContract();
