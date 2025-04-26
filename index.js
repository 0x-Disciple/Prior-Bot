require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const chalk = require('chalk');
const { ethers } = require('ethers');
const { HttpsProxyAgent } = require('https-proxy-agent');

// === Konstanta ===
const RPC_URL = 'https://base-sepolia-rpc.publicnode.com/89e4ff0f587fe2a94c7a2c12653f4c55d2bda1186cb6c1c95bd8d8408fbdc014';
const PRIOR = '0xeFC91C5a51E8533282486FA2601dFfe0a0b16EDb';
const USDC = '0xdB07b0b4E88D9D5A79A08E91fEE20Bb41f9989a2';
const ROUTER = '0x8957e1988905311EE249e679a29fc9deCEd4D910';
const REPORT_API = "https://prior-protocol-testnet-priorprotocol.replit.app/api/transactions";

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

// === Utilitas ===
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadWallets() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY not found in .env');
  return [pk]; // hanya satu wallet
}

function loadProxies() {
  try {
    const data = fs.readFileSync('./proxies.txt', 'utf8');
    return data.split('\n').map(x => x.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function createAxiosInstance(proxy = null) {
  const config = {
    timeout: 20000,
    headers: { 'Content-Type': 'application/json' }
  };
  if (proxy) config.httpsAgent = new HttpsProxyAgent(proxy);
  return axios.create(config);
}

// === Fungsi Token & Swap ===
async function checkAndApprove(wallet, provider, proxy, index) {
  const signer = new ethers.Wallet(wallet, provider);
  const token = new ethers.Contract(PRIOR, ERC20_ABI, signer);
  const decimals = await token.decimals();
  const balance = await token.balanceOf(signer.address);
  const formatted = ethers.utils.formatUnits(balance, decimals);

  console.log(chalk.cyan(`#${index+1} Balance: ${formatted} PRIOR`));
  const minAmount = ethers.utils.parseUnits("0.1", decimals);

  if (balance.lt(minAmount)) {
    console.log(chalk.red('❌ Not enough balance'));
    return false;
  }

  const allowance = await token.allowance(signer.address, ROUTER);
  if (allowance.lt(minAmount)) {
    console.log(chalk.yellow('⏳ Approving...'));
    const tx = await token.approve(ROUTER, ethers.constants.MaxUint256);
    await tx.wait();
    console.log(chalk.green('✅ Approved'));
  } else {
    console.log(chalk.green('✔ Already approved'));
  }
  return true;
}

async function swap(wallet, provider, proxy, index, count) {
  const signer = new ethers.Wallet(wallet, provider);
  const swapData = '0x8ec7baf1000000000000000000000000000000000000000000000000016345785d8a0000';

  try {
    console.log(chalk.yellow(`🔁 Swapping wallet #${index+1} [${count}]...`));
    const tx = await signer.sendTransaction({
      to: ROUTER, data: swapData, gasLimit: 300000
    });
    await tx.wait();
    console.log(chalk.green(`✅ Swap success: ${tx.hash}`));
    await reportSwap(signer.address, tx.hash, proxy);
  } catch (err) {
    console.log(chalk.red(`❌ Swap error: ${err.message}`));
  }
}

async function reportSwap(address, txHash, proxy) {
  const axiosInstance = createAxiosInstance(proxy);
  try {
    await axiosInstance.post(REPORT_API, {
      userId: address.toLowerCase(),
      type: "swap",
      txHash,
      fromToken: "PRIOR",
      toToken: "USDC",
      fromAmount: "0.1",
      toAmount: "0.2",
      status: "completed",
      blockNumber: 0
    });
    console.log(chalk.green('✅ Reported swap to API'));
  } catch (e) {
    console.log(chalk.red(`❌ Report failed: ${e.message}`));
  }
}

// === Main ===
(async () => {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const wallets = loadWallets();
  const proxies = loadProxies();

  const TOTAL_SWAP = 5;
  let completed = 0;

  while (completed < TOTAL_SWAP) {
    for (let i = 0; i < wallets.length && completed < TOTAL_SWAP; i++) {
      const wallet = wallets[i];
      const proxy = proxies[i % proxies.length] || null;

      const approved = await checkAndApprove(wallet, provider, proxy, i);
      if (approved) {
        await swap(wallet, provider, proxy, i, completed + 1);
        completed++;
        await sleep(5000);
      }
    }
    if (completed < TOTAL_SWAP) {
      console.log(chalk.yellow('⌛ Waiting 1 min before next round...'));
      await sleep(60 * 1000);
    }
  }
})();
