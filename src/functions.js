const Cp = require('child_process');
const Fs = require(`fs`);


export default class Functions {

  static log = (s) => {
    console.log(s);
  };

  static isLogined = async (page, timeout) => {
    try {
      await this.getBalance(page, timeout);
      return true;
    } catch (e) {
      return false;
    }
  };

  static read = async () => {
    const Readline = await this.require(`readline`);
    const rl = Readline.createInterface(process.stdin, process.stdout);
    return new Promise((res) => {
      rl.question(`> `, function (answer) {
        res(answer);
        rl.close();
      });

    });
  };

  static readExp = async (rexp) => {
    let num = `!`;
    const regexp = new RegExp(rexp);
    while (num.match(regexp) == null) {
      num = await this.read();
    }

    return num;
  };

  static saveDb = async (db) => {
    let out;
    const dir = `./db`;

    if (!Fs.existsSync(dir)) {
      Fs.mkdirSync(dir);
    }
    out = Fs.createWriteStream(`./db/.db`, {flags: `w`});

    out.write(`PHONE:${db.phone}\n`);
    out.write(`PASSWORD:${db.password}\n`);
    out.write(`ITERATIONS:${db.iterations}\n`);
    out.write(`DELAY:${db.delay}\n`);
    out.write(`SOURCE:${db.source}\n`);
    out.write(`AMOUNT:${db.amount}\n`);
    out.write(`PRICE:${db.price}\n`);

  };

  static rewriteDb = async (db) => {
    this.log(`- Insert information. Press enter to insert default values`);

    this.log(`--> Phone WITHOUT 8`);
    db.phone = await this.readExp(/[0-9]{10}/);

    this.log(`--> Password`);
    db.password = await this.read();

    this.log(`--> Number of active lots (default = 3)`);
    db.iterations = await this.readExp(/(^[0-9]{1,2}$)|(^\s*$)/);
    if (db.iterations.match(new RegExp(/^\s*$/)))
      db.iterations = 3;

    this.log(`--> Delay between attempts in seconds (default = 20)`);
    db.delay = await this.readExp(/(^[0-9]{1,2}$)|(^\s*$)/);
    if (db.delay.match(new RegExp(/^\s*$/)))
      db.delay = 20;

    this.log(`--> Minutes? [Y/N] (default = Y)`);
    db.source = await this.readExp(/(^[A-Za-z]$)|(^\s*$)/);
    if (db.source.match(new RegExp(/^\s*$/)))
      db.source = `calls`;
    else
      db.source = (db.source === `N` || db.source === `n`) ? `internet` : `calls`;

    this.log(`--> Lot amount (default = ${((db.source === `calls`) ? `50` : `3`)})`);
    db.amount = await this.readExp(/(^[0-9]{1,3}$)|(^\s*$)/);
    if (db.amount.match(new RegExp(/^\s*$/)))
      db.amount = (db.source === `calls`) ? 50 : 3;

    let m_price, i_price;
    // old_m_price = Math.floor((db.amount + 1) / 2);
    m_price = db.amount - 10 - Math.floor((db.amount - 50) / 5);
    i_price = 15 * db.amount;

    this.log(`--> Price (default = ${((db.source === `calls`) ? m_price : i_price)})`);
    db.price = await this.readExp(/(^[0-9]{1,3}$)|(^\s*$)/);
    if (db.price.match(new RegExp(/^\s*$/)))
      db.price = (db.source === `calls`) ? m_price : i_price;

    await this.saveDb(db);
    this.log(`- Information saved successfully`);
  };

  static readDb = async () => {
    const db = {
      validate: function f() {
        return !(db.phone === undefined ||
          db.password === undefined ||
          db.iterations === undefined ||
          db.delay === undefined ||
          db.source === undefined ||
          db.amount === undefined ||
          db.price === undefined);
      }
    };
    const dir = `./db`;

    if (!Fs.existsSync(dir)) {
      Fs.mkdirSync(dir);
    }

    await Fs.openSync(`./db/.db`, `a`);
    const str = await Fs.readFileSync(`./db/.db`, {encoding: `utf8`});
    const arrStr = str.split(`\n`);
    arrStr.forEach((item) => {
      const x = item.split(`:`);
      switch (x[0]) {
        case `PHONE`:
          db.phone = x[1];
          break;
        case `PASSWORD`:
          db.password = x[1];
          break;
        case `ITERATIONS`:
          db.iterations = x[1];
          break;
        case `DELAY`:
          db.delay = x[1];
          break;
        case `SOURCE`:
          db.source = x[1];
          break;
        case `AMOUNT`:
          db.amount = x[1];
          break;
        case `PRICE`:
          db.price = x[1];
          break;
        default:
          db.trash = x[1];
          break;
      }


    });

    return db;
  };

  static getBalance = async (page, timeout = -1) => {
    const s = `.profile-popup_balance-value span`;
    if (timeout > 0)
      await page.waitFor(s, {timeout: timeout});
    else
      await page.waitFor(s);
    let b = await page.evaluate((selector) => {
      return document.querySelector(selector).innerHTML;
    }, s);

    b = b.replace(`&nbsp;`, ``);
    b = b.replace(` `, ``);

    return b;
  };

  static rand = () => {
    return Math.floor(100 + Math.random() * 50);
  };

  static rand8 = () => {
    let t = Math.floor(1 + Math.random() * 10);
    if (t > 8)
      t = 4;

    return t;
  };

  static wClick = async (page, s, time = -1) => {
    if (time > 0)
      await page.waitFor(time);
    else
      await page.waitFor(s);
    await page.click(s);
  };


  static askForBD = async (db) => {
    if (!db.validate()) {
      await this.rewriteDb(db);
    } else {
      this.log(`- Read information from DB? [Y/N] (default = Y)`);
      let res = await this.readExp(/(^[A-Za-z]$)|(^\s*$)/);
      if (res.match(new RegExp(/^\s*$/)))
        res = `Y`;
      if (res === `N` || res === `n`)
        await this.rewriteDb(db);
    }
  };


  static readCookies = (s = `cookies.json`) => {
    return new Promise((resolve) => {
      (async () => {
        await Fs.readFile(`./db/cookies.json`, (e, data) => {
          if (e || data == null)
            resolve(null);
          else
            resolve(JSON.parse(data.toString()));
        });
      })();
    });
  };


  static askForCookies = async (cookies) => {
    if (cookies != null) {
      this.log(`- Restore previously saved cookies? [Y/N] (default = Y)`);
      let res = await this.readExp(/(^[A-Za-z]$)|(^\s*$)/);
      if (res.match(new RegExp(/^\s*$/)))
        res = `Y`;
      if (res === `N` || res === `n`)
        res = `N`;

      return res === `Y`;
    } else {
      return false;
    }
  };

  static require = async (module) => {
    try {
      require.resolve(module);
    } catch (e) {
      console.log(`> Could not resolve ${module}. Installing...`);
      Cp.execSync(`npm install ${module}`);
      await setImmediate(() => {});
      console.log(`> "${module}" has been installed`);
    }

    try {
      return require(module);
    } catch (e) {
      console.log(`Could not include "${module}". Restart the script`);
      process.exit(1);
    }
  }
}
