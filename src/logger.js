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
