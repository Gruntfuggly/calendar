# Calendar

![Screenshot](https://raw.githubusercontent.com/Gruntfuggly/calendar/master/resources/screenshot.png)

Shows your upcoming events from your Google calendar in a tree view inside VSCode. Also allows simple
events to be created, modified and deleted.

*This extension is currently in development - it will be updated often and things may break occasionally.*

## TODO

- [ ] Support for Outlook calendars

## Installing

You can install the latest version of the extension via the Visual Studio Marketplace [here](https://marketplace.visualstudio.com/items?itemName=Gruntfuggly.calendar).

Alternatively, open Visual Studio code, press `Ctrl+P` or `Cmd+P` and type:

    > ext install calendar

### Google calendar authorization

1. Visit <https://developers.google.com/calendar/quickstart/nodejs>
2. Click the **Enable the Google Calendar API** button in *Step 1*.
3. Click the **DOWNLOAD CLIENT CONFIGURATION** button and save the file somewhere.
4. Update the `calendar.google.credentialsFile` setting to point to the saved file.
5. Press F1 and run the command **Calendar: Authorize**
6. Click the **Get Authorization Code** button and follow the instructions in your browser. *Note: Google will warn you that the application is not verified, but you're the only person who will be accessing your calendar. Click* **Advanced** *and then click* **Go to Quickstart (unsafe)**.
7. Copy the code that google generates.
8. Press F1 and run the command **Calendar: Authorize** again.
9. Click the **Enter Authorization Code** and paste in the code that google gave you.

### Outlook calendar authorization

*Not currently supported.*

### Source Code

The source code is available on GitHub [here](https://github.com/Gruntfuggly/calendar).

## Configuration

| Setting                                   | Default | Description                                                                                                           |
|-------------------------------------------|---------|-----------------------------------------------------------------------------------------------------------------------|
| calendar.debug                            | false   | Enable a debug channel in the output view.                                                                            |
| calendar.locale                           |         | Normally the locale is determined automatically. This allows it to be overridden if required.                         |
| calendar.showInExplorer                   | true    | If true, show the view in the explorer view.                                                                          |
| calendar.maxEvents                        | 10      | Maximum number of future events to fetch from your calendar.                                                          |
| calendar.historicDays                     | 0       | Set this to show past events in tree (*Note:* `calendar.maxEvents` *is still applied*).                               |
| calendar.showDateInTitle                  | true    | Set to false to disable showing the current date in the view title.                                                   |
| calendar.showRelativeDates                | true    | Set to false to show full dates instead of **Today**, **Tomorrow**, etc.                                              |
| calendar.autoRefreshInterval              | 60      | The number of minutes between automatic refreshes of the calendar. Set to zero to disable automatic refreshing.       |
| calendar.notificationInterval             | 60      | Show a notification of an event this number of minutes before it occurs. Set to zero to disable notifications.        |
| calendar.notificationRepeatInterval       | 15      | After snoozing a notification, repeat it after this number of minutes. Set to zero to disable repeated notifications. |
| calendar.showAllDayNotificationsAtStartup | true    | If true, notifications for all day events occurring today and tomorrow will be shown when you start vscode.           |
| calendar.stickyNotifications              | true    | Set to false to allow notifications to close automatically after a short period of time.                              |
| calendar.google.enabled                   | true    | Set to true to enable google calendar integration.                                                                    |
| calendar.google.credentialsFile           |         | Path to your credentials file.                                                                                        |
| calendar.google.useDefaultReminders       | true    | Set to false to inhibit the default reminders when creating new events.                                               |
| calendar.outlook.enabled                  | false   | Set to true to enable outlook calendar integration.                                                                   |

## Known Issues

The awesome [chrono-node](https://www.npmjs.com/package/chrono-node) module used to convert human readable dates into actual dates supports **en**, **en-gb**, **de**, **pt**, **es**, **fr**, and **ja** locales. The extension will still work with other locales, and should display them correctly, but you may have odd results when creating or modifying events and reminders.

## Donate

If you find this extension useful, please feel free to donate [here](https://paypal.me/Gruntfuggly). Thanks!

### Credits

- Dentist, food and anniversary icon made by [Freepik](https://www.flaticon.com/authors/freepik) from <https://www.flaticon.com>
- Lock and Time icons made by [Smashicons](https://www.flaticon.com/authors/smashicons) from <https://www.flaticon.com>
- Birthday icon made by [srip](https://www.flaticon.com/authors/srip) from <https://www.flaticon.com/>
- Doctor icon made by [Prosymbols](https://www.flaticon.com/authors/prosymbols) from <https://www.flaticon.com/>
- Car icon made by [Kiranshastry](https://www.flaticon.com/authors/kiranshastry) from <https://www.flaticon.com>
- Plane icon made by [Good Ware](https://www.flaticon.com/authors/good-ware from <https://www.flaticon.com/>
- Alarm icon made by [Pixel perfect](https://www.flaticon.com/authors/pixel-perfect) from <https://www.flaticon.com/>
- Other icons from the [vscode](https://github.com/microsoft/vscode-icons) icon set.
