import Fs from "fs";
import {LoginException, AddException, DeleteException, InternetException, BaseException} from "./exceptions";
import {
  askForCookies,
  askForDB,
  autoRequire, getBalance,
  isLogined, linkGetterGenerator, rand, rand8,
  readCookies,
  readDb, readExp, repeatIfError,
  wClick
} from "./functions";
import {log, warn} from "./logger";
import fetch from "node-fetch";

(async () => {
    await autoRequire(`puppeteer`);
    await autoRequire(`puppeteer-extra`);
    await autoRequire(`chalk`);
    await autoRequire(`node-fetch`);
    await autoRequire(`readline`);
    await autoRequire(`puppeteer-extra-plugin-stealth`);

    const puppeteer = require(`puppeteer-extra`);
    const chalk = require(`chalk`);
    const stealthPlugin = require(`puppeteer-extra-plugin-stealth`);
    puppeteer.use(stealthPlugin());

    // Настройки программы

    const opt = {
      dev: true,
      origin: `https://voronezh.tele2.ru`
    };

    const getLink = linkGetterGenerator(opt.origin);

    let balance0;
    let s;
    let b;
    let bought;
    let rnd;


    try {
      log(`--> Tele 2 <--`);

      const db = await readDb();
      await askForDB(db);

      const cookiesFromFile = await readCookies();
      const restoreCookies = await askForCookies(cookiesFromFile);

      log(`- Starting up`);

      const browser = await puppeteer.launch({headless: !opt.dev, args: [`--start-fullscreen`]});
      const context = browser.defaultBrowserContext();
      await context.overridePermissions(getLink(), []);
      const page = await browser.newPage();

      await page.setViewport({width: 1400, height: 550});

      if (restoreCookies) {
        log(`- Restoring Cookies`);
        await page.setCookie(...cookiesFromFile);
      }

      await page.goto(getLink(), {waitUntil: `load`}).catch(() => {
        InternetException.handle();
      });

      if (!(await isLogined(page))) {
        await page.goto(getLink(), {waitUntil: `load`}).catch(() => {
          InternetException.handle();
        });

        log(`- Logging in`);
        await wClick(page, `div[data-cartridge-type="LoginAction2"]`);

        for (let erCount = 1; erCount <= 3; erCount++) {
          if (await isLogined(page)) {
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
            await wClick(page, s);
            await wClick(page, s, 500);
            await page.type(s, db.phone + ``);

            await wClick(page, `form.keycloak-login-form button[type="submit"]`);

            let pin;
            do {
              log(`- Code from SMS`);
              pin = await readExp(/[0-9]{6}/);
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

            if (await isLogined(page)) {
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

      // Теле 2 хреново сделали историю лотов, приходится фиксить мне

      await page.setRequestInterception(true);
      await page.on(`request`, async (request) => {
        if (request.url().endsWith(`created`) && request.method() === `GET`) {
          const response = await (await fetch(request.url(), {
            method: request.method(),
            credentials: `include`,
            body: request.postData(),
            headers: request.headers()
          })).json();

          if (response.data) {
            response.data = response.data.filter((item) => {
              if (item.status === `active`) {
                return true;
              }

              const creationDate = new Date(item.creationDate);
              const nowDate = new Date();
              const diff = Math.ceil(Math.abs(nowDate - creationDate) / (1000 * 60 * 60 * 24));

              return (diff <= 1);
            });
          }

          await request.respond({
            status: 200,
            contentType: `application/json`,
            body: JSON.stringify(response),
          });
        } else {
          await request.continue();
        }
      });

      /*
            await page.goto(getLink(`/stock-exchange/my`), {waitUntil: `load`});
            await page.waitFor(900000);
      */

      // Цикл удаление - заполнение
      let doWhile = true;
      while (doWhile) {
        await page.goto(getLink(`/stock-exchange/my`), {waitUntil: `load`});
        await page.waitFor(`.preloader-icon`, {hidden: true, timeout: 30000});

        let cleared = false;

        try {
          await page.waitFor(`.my-lot-item:first-child`, {timeout: 3000});
        } catch (e) {
          cleared = true;
        }

        if (!balance0) {
          balance0 = await getBalance(page);
        }

        b = await getBalance(page);
        bought = Math.floor((parseInt(b, 10) - parseInt(balance0, 10)) / db.price);

        log(`- Clearing.`);
        log(`-* Balance: ${chalk.rgb(0, 0, 0).bgGreen(` ${b} `)}. Bought: ${chalk.rgb(0, 0, 0).bgGreen(` ${bought} `)}`);

        while (!cleared && await page.$(`.my-lot-item:first-child .icon-edit`) !== null) {
          await repeatIfError(async () => {
            await wClick(page, `.my-lot-item:first-child .icon-edit`);

            s = `#exchangeEditLotPopup .btns-box .btn:not(.btn-black)`;
            await wClick(page, s);

            s = `#requestExecutorPopup .btns-box .btn:not(.btn-black)`;
            await wClick(page, s);

            try {
              s = `#requestExecutorPopup`;
              await page.waitFor(s, {hidden: true, timeout: 10000});
            } catch (e) {
              s = `#requestExecutorPopup .btns-box .btn:not(.btn-black)`;
              await wClick(page, s);
              s = `#requestExecutorPopup`;
              await page.waitFor(s, {hidden: true, timeout: 10000});
            }
          }, 3, async () => {
            warn(`Unknown trouble. Repeating`);
            await page.goto(getLink(`/stock-exchange/my`), {waitUntil: `load`});
            await page.waitFor(`.my-lot-item:first-child`);
          }, () => {
            warn(`Fatal error`);
            BaseException.handle();
          });
        }

        log(`- Adding`);
        for (let i = 0; i < db.iterations; i++) {
          try {
            await page.goto(getLink(`/stock-exchange/${db.source}`), {waitUntil: `load`});

            await wClick(page, `.exchange-block__create-lot-block .btn-black`);
            await wClick(page, `.lot-setup-popup > .lot-setup__manual-input > a`);

            s = `.lot-setup__field input[pattern="[0-9]*"]`;
            rnd = rand();
            await wClick(page, s);
            await page.click(s, {clickCount: 2});
            await page.type(s, db.amount + ``, {delay: rnd});

            s = `.lot-setup__cost-field-container > .lot-setup__manual-input > a`;
            await wClick(page, s);

            s = `.lot-setup__cost-field-container input[pattern="[0-9]*"]`;
            rnd = rand() + 100;
            await wClick(page, s);
            await page.click(s, {clickCount: 2});
            await page.type(s, db.price + ``, {delay: rnd});

            s = `.btns-box .btn-black`;
            await wClick(page, s);

            try {
              s = `#exchangeLotPersonalizationPopup`;
              await page.waitFor(s);

              rnd = rand8();
              s = `.emoji-field__available-values-block img:nth-child(${rnd})`;

              rnd = rand();
              await wClick(page, s);
              await wClick(page, s, rnd);
              await wClick(page, s, rnd);
              await page.waitFor(rnd);

              rnd = rand8();

              await wClick(page, `.lot-message-form__name-checkbox label[for="showSellerName"]`);
              await wClick(page, `#exchangeLotPersonalizationPopup .btns-box .btn-black`);

              s = `#exchangeLotPersonalizationPopup`;
              await page.waitFor(`#exchangeLotPersonalizationPopup`, {hidden: true});
            } catch (e) {
              continue;
            }
          } catch (e) {
            warn(e.message);
          }
        }

        b = await getBalance(page);
        bought = Math.floor((parseInt(b, 10) - parseInt(balance0, 10)) / db.price);

        log(`- Waiting for ${db.delay} sec.`);
        log(`-* Balance: ${chalk.rgb(0, 0, 0).bgGreen(` ${b} `)}. Bought: ${chalk.rgb(0, 0, 0).bgGreen(` ${bought} `)}`);

        await page.waitFor(db.delay * 1000);
      }
    } catch (e) {
      if (e instanceof BaseException) {
        console.error(e.message);
      } else {
        console.error(e.message);
      }
    }
  }
)();
