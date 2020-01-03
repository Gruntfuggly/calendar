
var vscode = require( 'vscode' );
var chrono = require( 'chrono-node' );
var googleCalendar = require( './google' );
var outlookCalendar = require( './outlook' );
var TreeView = require( './tree' );
var utils = require( './utils' );

var GOOGLE = 'GOOGLE';
var OUTLOOK = 'OUTLOOK';
var OK = 'OK';
var IGNORE = 'Snooze';

function isAllDay( parsedDateTime )
{
    return parsedDateTime.length > 0 && Object.keys( parsedDateTime[ 0 ].tags ).filter( function( tag )
    {
        return tag.match( /time.*parser/i );
    } ).length === 0;
}

function showEventHint( type, parsedDateTime, status )
{
    var hint;
    var allDay = isAllDay( parsedDateTime );

    if( allDay )
    {
        hint = type + " all-day event " + ( parsedDateTime.length > 1 ? "from " : "on " ) + parsedDateTime[ 0 ].start.date().toLocaleDateString( utils.getLocale() );
    }
    else
    {
        hint = type + " event at " + utils.formattedTime( parsedDateTime[ 0 ].start.date() ) + " on " + parsedDateTime[ 0 ].start.date().toLocaleDateString( utils.getLocale() );
    }

    if( parsedDateTime.length > 1 )
    {
        hint += " until " + parsedDateTime[ 1 ].start.date().toLocaleDateString( utils.getLocale() );
    }
    else if( parsedDateTime[ 0 ].end )
    {
        if( allDay )
        {
            hint += " until " + parsedDateTime[ 0 ].end.date().toLocaleDateString( utils.getLocale() );
        }
        else
        {
            hint += " until " + utils.formattedTime( parsedDateTime[ 0 ].end.date() );
        }
    }

    status.text = hint;
}

function showReminderHint( type, parsedDateTime, status )
{
    status.text = type + " at " + utils.formattedTime( parsedDateTime[ 0 ].start.date() ) + " on " + parsedDateTime[ 0 ].start.date().toLocaleDateString( utils.getLocale() );
}

function activate( context )
{
    var refreshTimer;
    var outputChannel;
    var notifications = {};

    var allDayNotificationsShown = false;

    var calendarTree = new TreeView.CalendarDataProvider( context, outputChannel );

    var calendarViewExplorer = vscode.window.createTreeView( "calendar-explorer", { treeDataProvider: calendarTree } );
    var calendarView = vscode.window.createTreeView( "calendar", { treeDataProvider: calendarTree } );

    function debug( text )
    {
        if( outputChannel )
        {
            outputChannel.appendLine( text );
        }
    }

    function resetOutputChannel()
    {
        if( outputChannel )
        {
            outputChannel.dispose();
            outputChannel = undefined;
        }
        if( vscode.workspace.getConfiguration( 'calendar' ).debug === true )
        {
            outputChannel = vscode.window.createOutputChannel( "Calendar" );
            googleCalendar.init( debug );
            debug( "Ready" );
        }
    }

    function acknowledgeNotification( event )
    {
        var acknowledgedNotifications = context.globalState.get( 'calendar.google.acknowledgedNotifications', {} );
        acknowledgedNotifications[ event.id ] = new Date();
        context.globalState.update( 'calendar.google.acknowledgedNotifications', acknowledgedNotifications );
    }

    function purgeAcknowledgedNotifications()
    {
        var now = new Date();
        var acknowledgedNotifications = context.globalState.get( 'calendar.google.acknowledgedNotifications', {} );

        Object.keys( acknowledgedNotifications ).map( function( event )
        {
            if( utils.daysFrom( new Date( acknowledgedNotifications[ event ] ), now ) > 30 )
            {
                debug( "Purging acknowledged notification" );
                delete acknowledgedNotifications[ event ];
            }
        } );
        context.globalState.update( 'calendar.google.acknowledgedNotifications', acknowledgedNotifications );
    }

    function setAutoRefreshTimer()
    {
        clearInterval( refreshTimer );

        var interval = vscode.workspace.getConfiguration( 'calendar' ).get( 'autoRefreshInterval', 60 );
        if( interval > 0 )
        {
            debug( "Refreshing in " + interval + " minutes" );
            refreshTimer = setInterval( refresh, interval * 60 * 1000 );
        }
    }

    function showAllDayNotifications( events )
    {
        function buttonClicked( button, event )
        {
            if( button === OK )
            {
                acknowledgeNotification( event );
            }
        }

        if( vscode.workspace.getConfiguration( 'calendar' ).get( 'showAllDayNotificationsAtStartup' ) )
        {
            events.map( function( event )
            {
                if( googleCalendar.isAllDay( event ) )
                {
                    var date = new Date( event.start.date );
                    var isToday = utils.isToday( date );
                    if( isToday || utils.isTomorrow( date ) )
                    {
                        var acknowledgedNotifications = context.globalState.get( 'calendar.google.acknowledgedNotifications', {} );
                        if( acknowledgedNotifications[ event.id ] === undefined )
                        {
                            var label = isToday ? "Today" : "Tomorrow";
                            if( vscode.workspace.getConfiguration( 'calendar' ).get( 'stickyNotifications' ) )
                            {
                                vscode.window.showErrorMessage( label + ": " + event.summary, OK ).then( function( button ) { buttonClicked( button, event ); } );
                            }
                            else
                            {
                                vscode.window.showInformationMessage( label + ": " + event.summary, OK ).then( function( button ) { buttonClicked( button, event ); } );
                            }
                        }
                    }
                }
            } );
        }
        allDayNotificationsShown = true;
    }

    function showNotification( event )
    {
        function buttonClicked( button, event )
        {
            if( button === OK )
            {
                acknowledgeNotification( event );
            }
            else if( button === IGNORE )
            {
                var repeatIntervalInMilliseconds = config.get( 'notificationRepeatInterval', 0 ) * 60000;
                if( repeatIntervalInMilliseconds > 0 )
                {
                    var now = new Date();
                    var nextNotification = now.getTime() + repeatIntervalInMilliseconds;
                    if( nextNotification < eventTime.getTime() )
                    {
                        scheduleRepeatNotification( event, repeatIntervalInMilliseconds );
                    }
                }
            }
        }

        var config = vscode.workspace.getConfiguration( 'calendar' );

        var acknowledgedNotifications = context.globalState.get( 'calendar.google.acknowledgedNotifications', {} );
        if( acknowledgedNotifications[ event.id ] === undefined )
        {
            debug( "Showing notification for " + event.summary );
            var eventTime = new Date( event.start.dateTime );
            var text = eventTime.toLocaleTimeString( utils.getLocale(), { hour: 'numeric', minute: 'numeric', hour12: true } ) + ": " + event.summary;

            if( config.get( 'stickyNotifications' ) )
            {
                vscode.window.showErrorMessage( text, OK, IGNORE ).then( function( button ) { buttonClicked( button, event ); } );
            }
            else
            {
                vscode.window.showInformationMessage( text, OK, IGNORE ).then( function( button ) { buttonClicked( button, event ); } );
            }
        }
    }

    function scheduleRepeatNotification( event, millisecondsUntilNotification )
    {
        if( notifications[ event.id ] !== undefined )
        {
            clearTimeout( notifications[ event.id ] );
        }
        if( millisecondsUntilNotification > 0 )
        {
            debug( "Scheduling repeat notification for " + event.summary + " in " + ( millisecondsUntilNotification / 60000 ).toFixed( 1 ) + " minutes" );
        }

        notifications[ event.id ] = setTimeout( showNotification, millisecondsUntilNotification, event );
    }

    function showNotifications( events )
    {
        var notificationInterval = vscode.workspace.getConfiguration( 'calendar' ).get( 'notificationInterval', 0 );

        if( notificationInterval > 0 )
        {
            events.map( function( event )
            {
                if( !googleCalendar.isAllDay( event ) )
                {
                    var notificationTime = new Date( event.start.dateTime ).getTime() - ( notificationInterval * 60000 );
                    var now = new Date();
                    var millisecondsUntilNotification = notificationTime - now.getTime();
                    if( millisecondsUntilNotification > ( -notificationInterval * 60000 ) && millisecondsUntilNotification < 86400000 )
                    {
                        if( notifications[ event.id ] === undefined )
                        {
                            if( millisecondsUntilNotification > 0 )
                            {
                                debug( "Scheduling notification for " + event.summary + " in " + ( millisecondsUntilNotification / 60000 ).toFixed( 1 ) + " minutes" );
                            }

                            notifications[ event.id ] = setTimeout( showNotification, millisecondsUntilNotification, event );
                        }
                    }
                }
            } );
        }
    }

    function fetch()
    {
        var config = vscode.workspace.getConfiguration( 'calendar' );
        if( config.get( 'google.enabled' ) )
        {
            googleCalendar.fetch( function( events )
            {
                debug( "Found " + events.length + " events" );
                events.map( function( event )
                {
                    calendarTree.add( event, GOOGLE );
                } );
                filterTree( context.workspaceState.get( 'calendar.filter' ) );
                calendarTree.refresh();
                setContext();
                if( !allDayNotificationsShown )
                {
                    showAllDayNotifications( events );
                }
                showNotifications( events );
                debug( "Ready" );
            }, context );
        }

        if( config.get( 'outlook.enabled' ) )
        {
            outlookCalendar.setCredentials(
                config.get( 'outlook.clientId' ),
                config.get( 'outlook.clientSecret' ) );

            outlookCalendar.fetch( function( events )
            {
            }, context );
        }
    }

    function refresh()
    {
        calendarTree.clear();
        fetch();
    }

    function clearFilter()
    {
        context.workspaceState.update( 'calendar.filter', undefined ).then( function()
        {
            debug( "Clearing filter" );
            calendarTree.clearFilter();
            calendarTree.refresh();
            setContext();
        } );
    }

    function setContext()
    {
        var showTree = true;
        var expanded = context.workspaceState.get( 'calendar.expanded' );
        var showInExplorer = vscode.workspace.getConfiguration( 'calendar' ).get( 'showInExplorer' );
        var authorized = context.globalState.get( 'calendar.google.token' ) ? true : false;
        var hasFilter = context.workspaceState.get( 'calendar.filter' );

        vscode.commands.executeCommand( 'setContext', 'calendar-show-expand', !expanded );
        vscode.commands.executeCommand( 'setContext', 'calendar-show-collapse', expanded );
        vscode.commands.executeCommand( 'setContext', 'calendar-tree-has-content', showTree );
        vscode.commands.executeCommand( 'setContext', 'calendar-is-filtered', hasFilter );
        vscode.commands.executeCommand( 'setContext', 'calendar-tree-has-content', calendarTree.hasContent() );
        vscode.commands.executeCommand( 'setContext', 'calendar-in-explorer', showInExplorer );
        vscode.commands.executeCommand( 'setContext', 'calendar-is-authorized', authorized );

        var message = calendarTree.hasContent() ? "" : "Click the refresh button to load the calendar...";
        calendarView.message = message;
        calendarViewExplorer.message = message;
    }

    function collapse()
    {
        context.workspaceState.update( 'calendar.expanded', false ).then( function()
        {
            calendarTree.clearExpansionState();
            calendarTree.refresh();
            setContext();
        } );
    }

    function expand()
    {
        context.workspaceState.update( 'calendar.expanded', true ).then( function()
        {
            calendarTree.clearExpansionState();
            calendarTree.refresh();
            setContext();
        } );
    }

    function filterTree( term )
    {
        if( term )
        {
            debug( "Filtering: " + term );
            calendarTree.filter( term );
        }
        else
        {
            debug( "No filter" );
            calendarTree.clearFilter();
        }
        calendarTree.refresh();
        setContext();
    }

    function getDateAndTime( callback, status, prompt, placeholder, type, originalDateTimeText, showHint, referenceDateTime )
    {
        vscode.window.showInputBox( {
            prompt: prompt,
            placeHolder: placeholder,
            value: originalDateTimeText,
            validateInput: function( value )
            {
                var parsedDateTime = chronoParser().parse( value, referenceDateTime ? referenceDateTime : new Date(), { forwardDate: true } );
                if( parsedDateTime.length > 0 )
                {
                    showHint( type, parsedDateTime, status );
                    return "";
                }
                status.text = type + "...";
                return "Date and time not understood (yet)";
            }
        } ).then( function( dateTime )
        {
            status.dispose();
            if( dateTime !== undefined )
            {
                var parsedDateTime = chronoParser().parse( dateTime, referenceDateTime ? referenceDateTime : new Date(), { forwardDate: true } );
                if( parsedDateTime.length > 0 )
                {
                    callback( parsedDateTime );
                }
                else
                {
                    vscode.window.showErrorMessage( "Failed to parse date and time" );
                }
            }
        } );
    }

    function chronoParser()
    {
        var chronoLocale = {
            "en": "en",
            "en-gb:": "en_GB",
            "de": "de",
            "pt": "pt",
            "es": "es",
            "fr": "fr",
            "ja": "ja"
        };

        var localizedChrono = chronoLocale[ utils.getLocale() ];
        var parser = chrono;
        if( localizedChrono )
        {
            parser = chrono[ localizedChrono ];
        }
        return parser;
    }

    function setLocation( node )
    {
        node = node ? node : selectedNode();

        vscode.window.showInputBox( {
            prompt: "Please enter the event location",
            value: node.event.location
        } ).then( function( location )
        {
            if( location )
            {
                if( node.source === GOOGLE )
                {
                    googleCalendar.setLocation( refresh, node.event, location );
                }
            }
        } );
    }

    function setReminder( node )
    {
        node = node ? node : selectedNode();

        var status = vscode.window.createStatusBarItem();
        status.text = "Setting reminder...";
        status.show();

        vscode.window.showQuickPick( [ "Email", "Browser Popup" ], {
            placeHolder: "Type of reminder",
        } ).then( function( method )
        {
            if( method )
            {
                var eventDateTime = new Date( node.event.start.date ? node.event.start.date : node.event.start.dateTime );

                getDateAndTime( function( parsedDateTime )
                {
                    if( node.source === GOOGLE )
                    {
                        var methods = {
                            "Browser Popup": "popup",
                            "Email": "email"
                        };
                        var minutesBefore = ( eventDateTime.getTime() - new Date( parsedDateTime[ 0 ].start.date() ).getTime() ) / 60000;
                        googleCalendar.setReminder( refresh, node.event, undefined, { method: methods[ method ], minutes: ~~minutesBefore } );
                    }
                }, status, "Please enter time for the reminder", "E.g., 2 hours earlier", "Setting reminder", undefined, showReminderHint, eventDateTime );
            }
        } );
    }

    function updateReminder( node )
    {
        var status = vscode.window.createStatusBarItem();
        status.text = "Updating reminder...";
        status.show();

        var eventDateTime = new Date( node.event.start.date ? node.event.start.date : node.event.start.dateTime );
        var reminder = node.event.reminders.overrides[ node.reminderIndex ];
        var reminderDateTime = new Date( eventDateTime.getTime() - parseInt( reminder.minutes ) * 60000 );
        var reminderDateTimeText = utils.formattedTime( reminderDateTime ) + " on " + reminderDateTime.toLocaleDateString( utils.getLocale() );

        getDateAndTime( function( parsedDateTime )
        {
            if( node.source === GOOGLE )
            {
                var minutesBefore = ( eventDateTime.getTime() - new Date( parsedDateTime[ 0 ].start.date() ).getTime() ) / 60000;
                googleCalendar.setReminder( refresh, node.event, node.reminderIndex, { method: reminder.method, minutes: ~~minutesBefore } );
            }
        }, status, "Please update the time for the reminder", "E.g., 10am the day before", "Updating reminder", reminderDateTimeText, showReminderHint, eventDateTime );
    }

    function selectedNode()
    {
        var result;
        if( calendarViewExplorer && calendarViewExplorer.visible === true )
        {
            calendarViewExplorer.selection.map( function( node )
            {
                result = node;
            } );
        }
        if( calendarView && calendarView.visible === true )
        {
            calendarView.selection.map( function( node )
            {
                result = node;
            } );
        }
        return result;
    }

    function remove( node )
    {
        node = node ? node : selectedNode();

        if( calendarTree.isLocationNode( node ) )
        {
            vscode.window.showInformationMessage( "Are you sure you want to remove this location?", 'Yes', 'No' ).then( function( confirm )
            {
                if( confirm === 'Yes' )
                {
                    if( node.source === GOOGLE )
                    {
                        googleCalendar.setLocation( refresh, node.event, "" );
                    }
                }
            } );
        }
        else if( calendarTree.isReminderNode( node ) )
        {
            vscode.window.showInformationMessage( "Are you sure you want to remove this reminder?", 'Yes', 'No' ).then( function( confirm )
            {
                if( confirm === 'Yes' )
                {
                    if( node.source === GOOGLE )
                    {
                        googleCalendar.deleteReminder( refresh, node.event, node.reminderIndex );
                    }
                }
            } );
        }

        else if( calendarTree.isEventNode( node ) )
        {
            vscode.window.showInformationMessage( "Are you sure you want to remove this event?", 'Yes', 'No' ).then( function( confirm )
            {
                if( confirm === 'Yes' )
                {
                    if( node.source === GOOGLE )
                    {
                        googleCalendar.deleteEvent( refresh, node.event.id );
                        acknowledgeNotification( node.event );
                    }
                }
            } );
        }
        else
        {
            vscode.window.showInformationMessage( "Please select an event in the calendar" );
        }
    }

    function edit( node )
    {
        node = node ? node : selectedNode();

        if( calendarTree.isLocationNode( node ) )
        {
            setLocation( node );
        }
        else if( calendarTree.isReminderNode( node ) )
        {
            updateReminder( node );
        }
        else if( calendarTree.isEventNode( node ) )
        {
            var status = vscode.window.createStatusBarItem();
            status.text = "Updating event...";
            status.show();

            vscode.window.showInputBox( {
                prompt: "Please modify the event description, if required",
                value: node.event.summary
            } ).then( function( summary )
            {
                if( summary )
                {
                    var originalDateTimeText = eventDateTimeText( node );

                    getDateAndTime( function( parsedDateTime )
                    {
                        if( node.source === GOOGLE )
                        {
                            var end;
                            if( parsedDateTime.length > 1 )
                            {
                                end = parsedDateTime[ 1 ].start.date();
                            }
                            else if( parsedDateTime[ 0 ].end )
                            {
                                end = parsedDateTime[ 0 ].end.date();
                            }
                            var eventDateTime = {
                                start: parsedDateTime[ 0 ].start.date(),
                                allDay: isAllDay( parsedDateTime ),
                                end: end
                            };

                            googleCalendar.editEvent( refresh, node.event, summary, eventDateTime );
                        }
                    }, status, "Please update the date and time of the event", "E.g., Tomorrow at 6.30pm", "Updating event", originalDateTimeText, showEventHint );
                }
                else
                {
                    status.dispose();
                }
            } );
        }
        else
        {
            vscode.window.showInformationMessage( "Please select an event in the calendar" );
        }
    }

    function eventDateTimeText( node )
    {
        var allDay = node.event.start.date !== undefined;
        var originalDateTime = new Date( allDay ? node.event.start.date : node.event.start.dateTime );
        var originalDateTimeText = utils.dateLabel( originalDateTime );
        if( !allDay )
        {
            originalDateTimeText += ' ' + originalDateTime.toLocaleTimeString( utils.getLocale() );
            if( node.event.end.dateTime !== node.event.start.dateTime )
            {
                originalDateTimeText += " until " + ( new Date( node.event.end.dateTime ) ).toLocaleTimeString( utils.getLocale() );
            }
        }
        else
        {
            if( node.event.end.date )
            {
                var endDate = new Date( node.event.end.date );
                if( utils.daysFrom( originalDateTime, endDate ) > 1 )
                {
                    originalDateTimeText += " until " + utils.dateLabel( endDate.addDays( -1 ) );
                }
            }
        }
        return originalDateTimeText;
    }

    function createEvent()
    {
        var status = vscode.window.createStatusBarItem();
        status.text = "Creating event...";
        status.show();

        vscode.window.showInputBox( { prompt: "Please enter an event description" } ).then( function( summary )
        {
            if( summary )
            {
                getDateAndTime( function( parsedDateTime )
                {
                    var config = vscode.workspace.getConfiguration( 'calendar' );

                    debug( "parsed date and time: " + JSON.stringify( parsedDateTime, null, 2 ) );
                    var eventDateTime = {
                        start: parsedDateTime[ 0 ].start.date(),
                        allDay: isAllDay( parsedDateTime )
                    };
                    if( parsedDateTime[ 0 ].end )
                    {
                        eventDateTime.end = parsedDateTime[ 0 ].end.date();
                    }
                    else if( parsedDateTime.length > 1 )
                    {
                        eventDateTime.end = parsedDateTime[ 1 ].start.date();
                    }

                    if( config.get( 'google.enabled' ) )
                    {
                        googleCalendar.createEvent( refresh, summary, eventDateTime );
                    }
                }, status, "Please enter the date and time of the event", "E.g., Friday at 4.15pm", "Creating event", undefined, showEventHint );
            }
            else
            {
                status.dispose();
            }
        } );
    }

    function filter()
    {
        vscode.window.showInputBox( { prompt: "Filter the calendar" } ).then( function( term )
        {
            context.workspaceState.update( 'calendar.filter', term ).then( function()
            {
                filterTree( term );
            } );
        } );
    }

    function resetCache()
    {
        // function purgeFolder( folder )
        // {
        //     fs.readdir( folder, function(br err, files )
        //     {
        //         files.map( function( file )
        //         {
        //             fs.unlinkSync( path.join( folder, file ) );
        //         } );
        //     } );
        // }

        context.globalState.update( 'calendar.google.token', undefined );

        context.workspaceState.update( 'calendar.expanded', undefined );
        context.workspaceState.update( 'calendar.filter', undefined );
        context.workspaceState.update( 'calendar.expandedNodes', undefined );

        // purgeFolder( context.globalStoragePath );

        debug( "Cache cleared" );

        refresh();
    }

    function openInBrowser( node )
    {
        debug( "Opening calendar, URL: " + node.url );
        vscode.commands.executeCommand( 'vscode.open', vscode.Uri.parse( node.url ) );
    }

    function register()
    {
        vscode.window.registerTreeDataProvider( 'calendar', calendarTree );

        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.open', openInBrowser ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.authorize', refresh ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.refresh', refresh ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.expand', expand ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.collapse', collapse ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.resetCache', resetCache ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.filter', filter ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.clearFilter', clearFilter ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.createEvent', createEvent ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.edit', edit ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.remove', remove ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.setLocation', setLocation ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.setReminder', setReminder ) );

        context.subscriptions.push( calendarViewExplorer.onDidExpandElement( function( e ) { calendarTree.setExpanded( e.element, true ); } ) );
        context.subscriptions.push( calendarView.onDidExpandElement( function( e ) { calendarTree.setExpanded( e.element, true ); } ) );
        context.subscriptions.push( calendarViewExplorer.onDidCollapseElement( function( e ) { calendarTree.setExpanded( e.element, false ); } ) );
        context.subscriptions.push( calendarView.onDidCollapseElement( function( e ) { calendarTree.setExpanded( e.element, false ); } ) );

        context.subscriptions.push( vscode.window.onDidChangeWindowState( function( e )
        {
            if( e.focused )
            {
                var interval = vscode.workspace.getConfiguration( 'calendar' ).get( 'autoRefreshInterval', 60 );
                if( interval > 0 )
                {
                    refresh();
                    setAutoRefreshTimer();
                }
            }
        } ) );

        context.subscriptions.push( vscode.workspace.onDidChangeConfiguration( function( e )
        {
            if( e.affectsConfiguration( "calendar" ) )
            {
                if( e.affectsConfiguration( "calendar.debug" ) )
                {
                    resetOutputChannel();
                }
                else if( e.affectsConfiguration( "calendar.locale" ) )
                {
                    var locale = vscode.workspace.getConfiguration( 'calendar' ).get( 'locale' );
                    if( locale !== undefined && locale.length > 0 && !utils.isValidLocale( locale ) )
                    {
                        vscode.window.showErrorMessage( "Invalid locale: " + locale );
                    }
                }
                else if( e.affectsConfiguration( 'calendar.showInExplorer' ) )
                {
                    setContext();
                }
                else if( e.affectsConfiguration( 'calendar.autoRefreshInterval' ) )
                {
                    setAutoRefreshTimer();
                }
                else if(
                    e.affectsConfiguration( 'calendar.maxEvents' ) ||
                    e.affectsConfiguration( 'calendar.historicDays' ) ||
                    e.affectsConfiguration( 'calendar.notificationInterval' ) ||
                    e.affectsConfiguration( 'calendar.notificationRepeatInterval' ) ||
                    e.affectsConfiguration( 'calendar.showRelativeDates' ) ||
                    e.affectsConfiguration( 'calendar.google.enabled' ) ||
                    e.affectsConfiguration( 'calendar.google.credentialsFile' ) ||
                    e.affectsConfiguration( 'calendar.outlook.enabled' ) ||
                    e.affectsConfiguration( 'calendar.outlook.clientSecret' ) ||
                    e.affectsConfiguration( 'calendar.outlook.clientId' ) )
                {
                    refresh();
                }
            }
        } ) );

        context.subscriptions.push( outputChannel );

        resetOutputChannel();
        setContext();
        if( vscode.workspace.getConfiguration( 'calendar' ).get( 'loadOnStartup', true ) === true )
        {
            fetch();
        }
        setAutoRefreshTimer();
        purgeAcknowledgedNotifications();
    }

    register();
}

function deactivate()
{
}

exports.activate = activate;
exports.deactivate = deactivate;
