import Fs from "fs";
import {LoginException, AddException, DeleteException, InternetException, BaseException} from "./exceptions";
import Functions from "./functions";


(async () => {
  await Functions.require(`puppeteer`);
  const Puppeteer = await Functions.require(`puppeteer-extra`);
  const Chalk = await Functions.require(`chalk`);
  const stealthPlugin = await Functions.require(`puppeteer-extra-plugin-stealth`);
  Puppeteer.use(stealthPlugin());

  const log = (s) => {
    console.log(`${s}`);
  };
  const warn = (s) => {
    console.log(`-x ${Chalk.yellow(s)}`);
  };

  let balance0 = `-1000000`;
  let s;
  let b;
  let bought;
  let rnd;
  let erCount;

  try {
    log(`--> Tele 2 <--`);

    const db = await Functions.readDb();
    const cookiesFromFile = await Functions.readCookies();
    await Functions.askForDB(db);
    const restoreCookies = await Functions.askForCookies(cookiesFromFile);

    log(`- Starting up`);

    const browser = await Puppeteer.launch({headless: false, args: [`--start-fullscreen`]});
    const context = browser.defaultBrowserContext();
    await context.overridePermissions(`https://voronezh.tele2.ru`, []);
    const page = await browser.newPage();

    const vp = {width: 1400, height: 550};
    await page.setViewport(vp);

    if (restoreCookies) {
      log(`- Restoring Cookies`);
      await page.setCookie(...cookiesFromFile);
    }

    await page.goto(`https://voronezh.tele2.ru`, {waitUntil: `load`}).catch(() => {
      InternetException.handle();
    });

    if (!(await Functions.isLogined(page, 3000))) {
      await page.goto(`https://voronezh.tele2.ru`, {waitUntil: `load`}).catch(() => {
        InternetException.handle();
      });

      log(`- Logging in`);
      await Functions.wClick(page, `div[data-cartridge-type="LoginAction2"]`);

      for (erCount = 1; erCount <= 3; erCount++) {
        if (await Functions.isLogined(page, 5000)) {
          const cookies = await page.cookies();
          await Fs.writeFile(`./db/cookies.json`, JSON.stringify(cookies, null, 2), (e) => {
            if (e) {
              throw e;
            }

            log(`- Cookies saved successfully`);
          });

          break;
        }

        try {
          s = `form.keycloak-login-form input[type="tel"]`;
          await Functions.wClick(page, s);
          await Functions.wClick(page, s, 500);
          await page.type(s, db.phone + ``);

          await Functions.wClick(page, `form.keycloak-login-form button[type="submit"]`);

          let pin;
          do {
            log(`- Code from SMS`);
            pin = await Functions.readExp(/[0-9]{6}/);
            s = `input[pattern="[0-9]*"]`;
            const inputs = await page.$$(s);
            for (let i = 0; i < 6; i++) {
              await inputs[i].type(pin[i]);
              await page.waitFor(100);
            }
          } while (await (async () => {
            try {
              await page.waitFor(`.static-error-text`, {timeout: 5000});
              warn(`Wrong code. Repeating`);
              return true;
            } catch (e) {
              return false;
            }
          })());

          if (await Functions.isLogined(page)) {
            const cookies = await page.cookies();
            await Fs.writeFile(`./db/cookies.json`, JSON.stringify(cookies, null, 2), (e) => {
              if (e) {
                throw e;
              }

              log(`- Cookies saved successfully`);
            });

            break;
          }

          warn(`Unknown trouble. Repeating`);
        } catch (e) {
          warn(`[${e.message}]. Repeating`);
        }

        if (erCount === 3) {
          LoginException.handle();
        }
      }
    }

    s = `.dropdown-menu`;
    await page.waitFor(s);

    // Цикл удаление - заполнение
    let doWhile = true;
    while (doWhile) {
      const requestListener = async (request) => {
        if (request.url().endsWith(`created`)) {
          const response = await Functions.getPuppeteerResponse(request);
          let body = JSON.parse(response.body);
          body.data = [body.data[1]];
          response.body = JSON.stringify(body);
          request.respond(response);
        } else {
          request.continue();
        }
      };

      await page.setRequestInterception(true);
      page.on(`request`, requestListener);

      await page.goto(`https://voronezh.tele2.ru/stock-exchange/my`, {waitUntil: `load`});
      await page.waitFor(`.my-lot-item:first-child`);

      page.removeListener(`request`, requestListener);
      await page.setRequestInterception(false);

      if (balance0 === `-1000000`) {
        balance0 = await Functions.getBalance(page);
      }
      b = await Functions.getBalance(page);
      bought = Math.floor((parseInt(b, 10) - parseInt(balance0, 10)) / db.price);

      log(`- Clearing. Balance: ${Chalk.red(b)}. Bought: ${Chalk.red(bought)}`);

      erCount = 0;
      while (await page.$(`.my-lot-item:first-child .icon-edit`) !== null) {
        try {
          await Functions.wClick(page, `.my-lot-item:first-child .icon-edit`);

          s = `#exchangeEditLotPopup .btns-box .btn:not(.btn-black)`;
          await Functions.wClick(page, s);

          s = `#requestExecutorPopup .btns-box .btn:not(.btn-black)`;
          await Functions.wClick(page, s);

          try {
            s = `#requestExecutorPopup`;
            await page.waitFor(s, {hidden: true, timeout: 10000});
          } catch (e) {
            s = `#requestExecutorPopup .btns-box .btn:not(.btn-black)`;
            await Functions.wClick(page, s);
            s = `#requestExecutorPopup`;
            await page.waitFor(s, {hidden: true, timeout: 10000});
          }
        } catch (e) {
          if (erCount === 3) {
            DeleteException.handle();
          }
          warn(`Unknown trouble. Repeating`);
          erCount++;
          await page.goto(`https://voronezh.tele2.ru/stock-exchange/my`, {waitUntil: `load`});
          await page.waitFor(`.my-lot-item:first-child`);
        }
      }

      log(`- Adding`);
      erCount = 0;
      for (let i = 0; i < db.iterations; i++) {
        try {
          await page.goto(`https://voronezh.tele2.ru/stock-exchange/${db.source}`, {waitUntil: `load`});

          await Functions.wClick(page, `.exchange-block__create-lot-block .btn-black`);
          await Functions.wClick(page, `.lot-setup-popup > .lot-setup__manual-input > a`);

          s = `.lot-setup__field input[pattern="[0-9]*"]`;
          rnd = Functions.rand();
          await Functions.wClick(page, s);
          await page.click(s, {clickCount: 2});
          await page.type(s, db.amount + ``, {delay: rnd});

          s = `.lot-setup__cost-field-container > .lot-setup__manual-input > a`;
          await Functions.wClick(page, s);

          s = `.lot-setup__cost-field-container input[pattern="[0-9]*"]`;
          rnd = Functions.rand() + 100;
          await Functions.wClick(page, s);
          await page.click(s, {clickCount: 2});
          await page.type(s, db.price + ``, {delay: rnd});

          s = `.btns-box .btn-black`;
          await Functions.wClick(page, s);

          s = `#exchangeLotPersonalizationPopup`;
          await page.waitFor(s);

          rnd = Functions.rand8();
          s = `.emoji-field__available-values-block img:nth-child(${rnd})`;

          rnd = Functions.rand();
          await Functions.wClick(page, s);
          await Functions.wClick(page, s, rnd);
          await Functions.wClick(page, s, rnd);
          await page.waitFor(rnd);

          rnd = Functions.rand8();

          await Functions.wClick(page, `.lot-message-form__name-checkbox label[for="showSellerName"]`);
          await Functions.wClick(page, `#exchangeLotPersonalizationPopup .btns-box .btn-black`);

          s = `#exchangeLotPersonalizationPopup`;
          await page.waitFor(`#exchangeLotPersonalizationPopup`, {hidden: true});
        } catch (e) {
          if (erCount >= db.iterations) {
            AddException.message += `\n` + e.message;
            AddException.handle();
          }
          warn(`Unknown trouble. Repeating`);
          warn(e.message);
          erCount++;
          i--;
        }
      }

      b = await Functions.getBalance(page);
      bought = Math.floor((parseInt(b, 10) - parseInt(balance0, 10)) / db.price);

      log(`- Waiting for ${db.delay} sec. Balance: ${Chalk.red(b)}. Bought: ${Chalk.red(bought)}`);

      await page.waitFor(db.delay * 1000);
    }
  } catch (e) {
    if (e instanceof BaseException) {
      console.error(e.message);
    } else {
      console.error(e.message);
    }
  }
})();
