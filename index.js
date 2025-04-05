const { ethers } = require("ethers");
const chalk = require("chalk").default;
const prompt = require("prompt-sync")();
const banner = require("./config/banner");
require("dotenv").config();

const RPC_URL = 'https://base-sepolia-rpc.publicnode.com/89e4ff0f587fe2a94c7a2c12653f4c55d2bda1186cb6c1c95bd8d8408fbdc014';
const ROUTER_ADDRESS = '0x0f1DADEcc263eB79AE3e4db0d57c49a8b6178B0B';

const PRIOR_ADDRESS = '0xc19Ec2EEBB009b2422514C51F9118026f1cD89ba';
const USDT_ADDRESS = '0x014397DaEa96CaC46DbEdcbce50A42D5e0152B2E';
const USDC_ADDRESS = '0x109694D75363A75317A8136D80f50F871E81044e';

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const privateKeys = process.env.PRIVATE_KEY.split(",");

const log = {
  waiting: (msg) => console.log(chalk.blue("[WAITING]"), msg),
  success: (msg) => console.log(chalk.green("[SUCCESS]"), msg),
  error: (msg) => console.log(chalk.red("[ERROR]"), msg),
  warning: (msg) => console.log(chalk.yellow("[WARNING]"), msg),
  pending: (msg) => console.log(chalk.cyan("[PENDING]"), msg),
  info: (msg) => console.log(chalk.magenta("[INFO]"), msg),
};

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function approveIfNeeded(wallet, tokenAddress, spender, amount) {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const allowance = await contract.allowance(wallet.address, spender);
    if (allowance.lt(amount)) {
      log.waiting(`Approving ${tokenAddress}...`);
      const tx = await contract.approve(spender, amount.mul(ethers.BigNumber.from(1000))); // approve banyak biar ga ulang
      log.pending(`TX: ${tx.hash}`);
      await tx.wait();
      log.success("Approved!");
    } else {
      log.warning("Already approved.");
    }
  } catch (error) {
    log.error("Approve gagal ❌");
    log.warning(error.message);
    throw error;
  }
}

async function printBalances(wallet) {
  const tokens = [
    { address: PRIOR_ADDRESS, name: "PRIOR" },
    { address: USDC_ADDRESS, name: "USDC" },
    { address: USDT_ADDRESS, name: "USDT" },
  ];

  log.waiting(`Checking balances for ${wallet.address}`);
  for (const token of tokens) {
    const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
    const balance = await contract.balanceOf(wallet.address);
    const decimals = await contract.decimals();
    const symbol = await contract.symbol();
    const readable = ethers.utils.formatUnits(balance, decimals);
    console.log(chalk.gray(`  ${symbol}: ${readable}`));
  }
}

async function swapPRIOR(wallet, tokenType, amountInWei, i) {
  try {
    let txData;

    if (tokenType === 'USDT') {
      txData = '0x03b530a3' + ethers.utils.defaultAbiCoder.encode(['uint256'], [amountInWei]).slice(2);
    } else if (tokenType === 'USDC') {
      txData = '0xf3b68002' + ethers.utils.defaultAbiCoder.encode(['uint256'], [amountInWei]).slice(2);
    } else {
      log.error("Token tujuan tidak valid. Hanya mendukung USDT atau USDC.");
      return;
    }

    log.waiting(`(${i}) Swapping PRIOR → ${tokenType}...`);
    const tx = await wallet.sendTransaction({
      to: ROUTER_ADDRESS,
      data: txData,
      gasLimit: ethers.utils.hexlify(500000),
    });

    log.pending(`(${i}) TX: ${tx.hash}`);
    await tx.wait();
    log.success(`(${i}) Swap PRIOR → ${tokenType} berhasil!`);
  } catch (error) {
    log.error(`(${i}) Swap PRIOR → ${tokenType} gagal ❌`);
    log.warning(error.message);
    throw error;
  }
}

(async () => {
    const tokenInput = prompt("Swap PRIOR ke token apa? (1 = USDC, 2 = USDT): ");
    let tokenType;
  
    if (tokenInput === '1') {
      tokenType = 'USDC';
    } else if (tokenInput === '2') {
      tokenType = 'USDT';
    } else {
      log.error("Input tidak valid! Harus 1 (USDC) atau 2 (USDT).");
      return;
    }
  
    let amountInput = prompt("Masukkan jumlah PRIOR untuk swap per TX (default 0.01): ");
    if (!amountInput) amountInput = "0.01";
  
    const repeatInput = prompt("Mau swap berapa kali? (default 20): ");
    const repeat = repeatInput ? parseInt(repeatInput) : 20;
  
    for (const key of privateKeys) {
      try {
        const wallet = new ethers.Wallet(key.trim(), provider);
        log.info(`\n=== Wallet: ${wallet.address} ===`);
  
        await printBalances(wallet);
  
        const prior = new ethers.Contract(PRIOR_ADDRESS, ERC20_ABI, provider);
        const decimals = await prior.decimals();
        const amountInWei = ethers.utils.parseUnits(amountInput, decimals);
  
        await approveIfNeeded(wallet, PRIOR_ADDRESS, ROUTER_ADDRESS, amountInWei);
  
        for (let i = 1; i <= repeat; i++) {
          await swapPRIOR(wallet, tokenType, amountInWei, i);
          await delay(1000); // delay 1 detik per swap
        }
  
        log.waiting("Checking updated balances...");
        await printBalances(wallet);
      } catch (err) {
        log.error(`[${wallet?.address || "UNKNOWN"}] Gagal diproses ❌`);
        log.warning(err.message);
      }
    }
  })();
  