# Calendar

<img src="https://raw.githubusercontent.com/Gruntfuggly/calendar/master/resources/screenshot.png">

Shows your upcoming events from your Google calendar in a tree view inside VSCode. Also allows simple
events to be created, modified and deleted.

## TODO

- [ ] Support for showing some historic events
- [ ] Support for adding all-day events
- [ ] Support for adding/editing multi-day events
- [ ] Support for Outlook calendars
- [ ] Support for locations
- [ ] Support for reminders
- [ ] Prevent showing the same notifications repeatedly

## Installing

You can install the latest version of the extension via the Visual Studio Marketplace [here](https://marketplace.visualstudio.com/items?itemName=Gruntfuggly.calendar).

Alternatively, open Visual Studio code, press `Ctrl+P` or `Cmd+P` and type:

    > ext install calendar

### Google calendar authorization

1. Visit https://developers.google.com/calendar/quickstart/nodejs
2. click the **Enable the Google Calendar API** button in *Step 1*.
3. click the **DOWNLOAD CLIENT CONFIGURATION** button and save the file somewhere.
4. update the `calendar.google.credentialsFile` setting to point to the saved file.
5. press F1 and run the command **Calendar: Authorize**
6. click the **Get Authorization Code** button and follow the instructions in your browser. *Note: Google will warn you that the application is not trusted, but you're the only person who will be accessing your calendar.*
7. copy the code that google generates.
8. press F1 and run the command **Calendar: Authorize** again.
9. click the **Enter Authorization Code** and paste in the code that google gave you.

### Outlook calendar authorization

*Not currently supported*

### Source Code

The source code is available on GitHub [here](https://github.com/Gruntfuggly/calendar).

## Configuration

| Setting                               | Default | Description                                                                                                     |
|---------------------------------------|---------|-----------------------------------------------------------------------------------------------------------------|
| calendar.debug                        | false   | Enable a debug channel in the output view                                                                       |
| calendar.showInExplorer               |         | If true, show the view in the explorer                                                                          |
| calendar.maxEvents                    | 10      | Maximum number of future events to fetch from your calendar                                                     |
| calendar.showRelativeDates            | true    | Set to false to show full dates instead of **Today**, **Tomorrow**, etc.                                        |
| calendar.google.enabled               | true    | Set to true to enable google calendar integration                                                               |
| calendar.google.credentialsFile       |         | Path to your credentials file                                                                                   |
| calendar.outlook.enabled              | false   | Set to true to enable outlook calendar integration                                                              |
| calendar.autoRefreshInterval          | 60      | The number of minutes between automatic refreshes of the calendar. Set to zero to disable automatic refreshing. |
| calendar.reminderInterval             | 60      | The number of minutes prior to an event to show a reminder. Set to zero to disable reminders.                   |
| calendar.showAllDayRemindersAtStartup | true    | If true, reminders for all day events occurring today and tomorrow will be shown.                               |
<!--
| calendar.outlook.clientId     | | Your client ID for your outlook calendar     |
| calendar.outlook.clientSecret | | Your client secret for your outlook calendar |
-->
## Donate

If you find this extension useful, please feel free to donate <a href="https://paypal.me/Gruntfuggly">here</a>. Thanks!

### Credits

- Calendar, dentist, food and anniversary icon made by <a href="https://www.flaticon.com/authors/freepik" title="Freepik">Freepik</a> from <a href="https://www.flaticon.com" title="Flaticon">www.flaticon.com</a>
- Lock and Time icons made by <a href="https://www.flaticon.com/authors/smashicons" title="Smashicons">Smashicons</a> from <a href="https://www.flaticon.com" title="Flaticon">www.flaticon.com</a>
- Birthday icon made by <a href="https://www.flaticon.com/authors/srip" title="srip">srip</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a>
- Doctor icon made by <a href="https://www.flaticon.com/authors/prosymbols" title="Prosymbols">Prosymbols</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a>
- Car icon made by <a href="https://www.flaticon.com/authors/kiranshastry" title="Kiranshastry">Kiranshastry</a> from <a href="https://www.flaticon.com" title="Flaticon">www.flaticon.com</a>
- Plane icon made by <a href="https://www.flaticon.com/authors/good-ware" title="Good Ware">Good Ware</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a>
- Other icons from the [vscode](https://github.com/microsoft/vscode-icons) icon set.