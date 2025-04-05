const chalk = require("chalk").default;
const figlet = require("figlet");

function displayBanner() {
    const banner = figlet.textSync("PRIOR PROTOCOL", {
        font: "Slant",
        horizontalLayout: "default",
        verticalLayout: "default",
    });
    console.log(chalk.green(banner));
    console.log(chalk.cyan('======================================='));
    console.log(chalk.magenta('Github : https://github.com/0x-Disciple'));
    console.log(chalk.magenta('Telegram : https://t.me/CryptoKidzz'));
    console.log(chalk.cyan('======================================='));
}
displayBanner();