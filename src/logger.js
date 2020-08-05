import {autoRequire} from "./functions";

const chalk = require(`chalk`);
const jsonfy = (s) => (typeof s === `object`) ? JSON.stringify(s) : s;

export const log = (s) => {
  console.log(jsonfy(s));
};
export const warn = (s) => {
  console.log(chalk.yellow(`-x ${jsonfy(s)}`));
};
export const err = (s) => {
  console.log(chalk.red(`-X ${jsonfy(s)}`));
};
export const succ = (s) => {
  console.log(chalk.green(`-V ${jsonfy(s)}`));
};
export const inf = (s) => {
  console.log(chalk.blue(jsonfy(s)));
};
export const fillSucc = (s) => {
  console.log(chalk.rgb(0, 0, 0).bgGreen(`-V ${jsonfy(s)} `));
};

export const printTable = async (...rows) => {
  await autoRequire(`string-length`);
  const stringLength = require(`string-length`);

  const fixLength = (str, length, symbol = ` `) => {
    while (stringLength(str) < length) {
      str += symbol;
    }
    return str;
  };

  let maxWidth = 0;

  for (let row of rows) {
    if (typeof row === `string`) {
      row = [row];
    }

    for (let str of row) {
      maxWidth = Math.max(maxWidth, stringLength(str));
    }
  }

  let borderString = `+` + fixLength(``, maxWidth + 2, `-`) + `+`;

  for (let row of rows) {
    log(borderString);
    if (typeof row === `string`) {
      row = [row];
    }

    for (let str of row) {
      log(`| ` + fixLength(str, maxWidth) + ` |`);
    }
  }
  log(borderString);
}