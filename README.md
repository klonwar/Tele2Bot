# Tele2 Bot

Программа, позволяющая вам запустить своего бота, который будет сам выставлять и убирать лоты на бирже Tele2. Настройка бота происходит при запуске.

### Настройка бота
 
При первом запуске вам надо ввести номер телефона. Когда бот будет заходить в ваш аккаунт, вам надо будет ввести в окно консоли пин-код, который вам придет по смс. Дальше вам необходимо выбрать:

* Количество активных лотов (по умолчанию 3). Количество одинаковых лотов, которые программа будет выкладывать каждую итерацию.
* Задержка между итерациями. После выкладывания того количества лотов, которое вы указали, программа будет приостановлена на время, чтобы лоты успели купить.
* Минуты/Гигабайты. Поддержку SMS-лотов я не добавлял, так что Y = минуты, N = гигабайты.
* Размер лота. Дефолтное значение рассчитывается по специальной формуле, поэтому оно всегда минимально возможное для выставления. Вы можете выбрать другое значение.
* Цена. Дефолтное значение, опять же, минимально.

### Несколько полезных фич

* Если вы хотите выбрать дефолтное значение, то просто нажмите Enter.
* После заполнения всех данных, они сохранятся. При последующих запусках программа спросит: загрузить сохраненные настройки, или ввести все заново.
* После первого входа в профиль Tele2 программа сохранит куки сайта. При последующих запусках их можно будет использовать. При этом программе не нужно будет заново входить в ваш аккаунт с помощью кода. Программа спросит у вас, восстановить ли куки.

### Запуски бота

У вас есть два пути. 

1) Выполните команду `npm run exe`. Теперь вы можете запускать бота через исполняемый файл
2) Вам понадобится совершить несколько действий. Скачайте **NodeJS**. Установите все пакеты, которые указаны в package.json с помощью команды `npm install`. С помощью **babel** (конфиг есть в репозитории) приведите исходники к нужному виду (команда `npm run build`). Дальше, для запуска можно использовать `node dist/main.js` чтобы запустить программу. Все это легче проводить в какой-нибудь IDE (я использую PhpStorm).
