
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

function showHint( type, parsedDateTime, status )
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

function activate( context )
{
    var refreshTimer;
    var outputChannel;
    var reminders = {};

    var allDayRemindersShown = false;

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

    function purgeAcknowledgedReminders()
    {
        var now = new Date();
        var acknowledgedReminders = context.globalState.get( 'calendar.google.acknowledgedReminders', {} );

        Object.keys( acknowledgedReminders ).map( function( event )
        {
            if( utils.daysFrom( new Date( acknowledgedReminders[ event ] ), now ) > 30 )
            {
                debug( "Purging acknowledged reminder" );
                delete acknowledgedReminders[ event ];
            }
        } );
        context.globalState.update( 'calendar.google.acknowledgedReminders', acknowledgedReminders );
    }

    function setAutoRefreshTimer()
    {
        debug( "setAutoRefreshTimer" );
        clearInterval( refreshTimer );

        var interval = vscode.workspace.getConfiguration( 'calendar' ).get( 'autoRefreshInterval', 60 );
        if( interval > 0 )
        {
            debug( "Refreshing in " + interval + " minutes" );
            refreshTimer = setInterval( refresh, interval * 60 * 1000 );
        }
    }

    function showAllDayReminders( events )
    {
        if( vscode.workspace.getConfiguration( 'calendar' ).get( 'showAllDayRemindersAtStartup' ) )
        {
            events.map( function( event )
            {
                if( googleCalendar.isAllDay( event ) )
                {
                    var date = new Date( event.start.date );
                    var isToday = utils.isToday( date );
                    if( isToday || utils.isTomorrow( date ) )
                    {
                        var acknowledgedReminders = context.globalState.get( 'calendar.google.acknowledgedReminders', {} );
                        if( acknowledgedReminders[ event.id ] === undefined )
                        {
                            var label = isToday ? "Today" : "Tomorrow";
                            if( vscode.workspace.getConfiguration( 'calendar' ).get( 'stickyReminders' ) )
                            {
                                vscode.window.showErrorMessage( label + ": " + event.summary, OK ).then( function( button )
                                {
                                    if( button === OK )
                                    {
                                        acknowledgedReminders[ event.id ] = date;
                                        context.globalState.update( 'calendar.google.acknowledgedReminders', acknowledgedReminders );
                                    }
                                } );
                            }
                            else
                            {
                                vscode.window.showInformationMessage( label + ": " + event.summary );
                            }
                        }
                    }
                }
            } );
        }
        allDayRemindersShown = true;
    }

    function showReminder( event )
    {
        var config = vscode.workspace.getConfiguration( 'calendar' );

        var acknowledgedReminders = context.globalState.get( 'calendar.google.acknowledgedReminders', {} );
        if( acknowledgedReminders[ event.id ] === undefined )
        {
            debug( "Showing notification for " + event.summary );
            var eventTime = new Date( event.start.dateTime );
            var text = eventTime.toLocaleTimeString( utils.getLocale(), { hour: 'numeric', minute: 'numeric', hour12: true } ) + ": " + event.summary;

            if( config.get( 'stickyReminders' ) )
            {
                vscode.window.showErrorMessage( text, OK, IGNORE ).then( function( button )
                {
                    if( button === OK )
                    {
                        acknowledgedReminders[ event.id ] = eventTime;
                        context.globalState.update( 'calendar.google.acknowledgedReminders', acknowledgedReminders );
                    }
                    else
                    {
                        var repeatIntervalInMilliseconds = config.get( 'reminderRepeatInterval', 0 ) * 60000;
                        if( repeatIntervalInMilliseconds > 0 )
                        {
                            var now = new Date();
                            var nextReminder = now.getTime() + repeatIntervalInMilliseconds;
                            if( nextReminder < eventTime.getTime() )
                            {
                                scheduleRepeatReminder( event, repeatIntervalInMilliseconds );
                            }
                        }
                    }
                } );
            }
            else
            {
                vscode.window.showInformationMessage( text );
            }
        }
    }

    function scheduleRepeatReminder( event, millisecondsUntilReminder )
    {
        if( reminders[ event.id ] !== undefined )
        {
            clearTimeout( reminders[ event.id ] );
        }
        if( millisecondsUntilReminder > 0 )
        {
            debug( "Scheduling repeat reminder for " + event.summary + " in " + ( millisecondsUntilReminder / 60000 ).toFixed( 1 ) + " minutes" );
        }

        reminders[ event.id ] = setTimeout( showReminder, millisecondsUntilReminder, event );
    }

    function showReminders( events )
    {
        var reminderInterval = vscode.workspace.getConfiguration( 'calendar' ).get( 'reminderInterval', 0 );

        if( reminderInterval > 0 )
        {
            events.map( function( event )
            {
                if( !googleCalendar.isAllDay( event ) )
                {
                    var reminderTime = new Date( event.start.dateTime ).getTime() - ( reminderInterval * 60000 );
                    var now = new Date();
                    var millisecondsUntilReminder = reminderTime - now.getTime();
                    if( millisecondsUntilReminder > ( -reminderInterval * 60000 ) && millisecondsUntilReminder < 86400000 )
                    {
                        if( reminders[ event.id ] !== undefined )
                        {
                            clearTimeout( reminders[ event.id ] );
                        }
                        if( millisecondsUntilReminder > 0 )
                        {
                            debug( "Scheduling reminder for " + event.summary + " in " + ( millisecondsUntilReminder / 60000 ).toFixed( 1 ) + " minutes" );
                        }

                        reminders[ event.id ] = setTimeout( showReminder, millisecondsUntilReminder, event );
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
                events.map( function( event )
                {
                    debug( "Event:" + JSON.stringify( event ) );
                    calendarTree.add( event, GOOGLE );
                } );
                filterTree( context.workspaceState.get( 'calendar.filter' ) );
                calendarTree.refresh();
                setContext();
                if( !allDayRemindersShown )
                {
                    showAllDayReminders( events );
                }
                showReminders( events );
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

    function getEventDateAndTime( callback, status, prompt, type, originalDateTimeText )
    {
        vscode.window.showInputBox( {
            prompt: prompt,
            placeHolder: "E.g., Tomorrow at 6.30pm",
            value: originalDateTimeText,
            validateInput: function( value )
            {
                var parsedDateTime = chrono.parse( value, new Date(), { forwardDate: true } );
                if( parsedDateTime.length > 0 )
                {
                    showHint( type, parsedDateTime, status );
                    return "";
                }
                status.text = type + " event...";
                return "Date and time not understood (yet)";
            }
        } ).then( function( dateTime )
        {
            status.dispose();
            if( dateTime !== undefined )
            {
                var parsedDateTime = chrono.parse( dateTime, new Date(), { forwardDate: true } );
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

    function setLocation( node )
    {
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

    function register()
    {
        vscode.window.registerTreeDataProvider( 'calendar', calendarTree );

        vscode.commands.registerCommand( 'calendar.open', function( url )
        {
            debug( "Opening calendar, URL: " + url );
            // TODO Open in browser
        } );

        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.authorize', refresh ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.refresh', refresh ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.expand', expand ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.collapse', collapse ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.resetCache', function()
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
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.filter', function()
        {
            vscode.window.showInputBox( { prompt: "Filter the calendar" } ).then( function( term )
            {
                context.workspaceState.update( 'calendar.filter', term ).then( function()
                {
                    filterTree( term );
                } );
            } );
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.createEvent', function()
        {
            var status = vscode.window.createStatusBarItem();
            status.text = "Creating event...";
            status.show();

            vscode.window.showInputBox( { prompt: "Please enter an event description" } ).then( function( summary )
            {
                if( summary )
                {
                    getEventDateAndTime( function( parsedDateTime )
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
                    }, status, "Please enter the date and time of the event", "Creating" );
                }
                else
                {
                    status.dispose();
                }
            } );
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.editEvent', function( node )
        {
            node = node ? node : selectedNode();

            if( calendarTree.isLocationNode( node ) )
            {
                setLocation( node );
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

                        getEventDateAndTime( function( parsedDateTime )
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

                                googleCalendar.editEvent( refresh, node.event.id, summary, eventDateTime );
                            }
                        }, status, "Please update the date and time of the event", "Updating", originalDateTimeText );
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
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.deleteEvent', function( node )
        {
            node = node ? node : selectedNode();

            if( calendarTree.isLocationNode( node ) )
            {
                vscode.window.showInformationMessage( "Are you sure you want to delete this location?", 'Yes', 'No' ).then( function( confirm )
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
            else if( calendarTree.isEventNode( node ) )
            {
                vscode.window.showInformationMessage( "Are you sure you want to delete this event?", 'Yes', 'No' ).then( function( confirm )
                {
                    if( confirm === 'Yes' )
                    {
                        if( node.source === GOOGLE )
                        {
                            googleCalendar.deleteEvent( refresh, node.event.id );
                            var acknowledgedReminders = context.globalState.get( 'calendar.google.acknowledgedReminders', {} );
                            acknowledgedReminders[ node.event.id ] = new Date();
                            context.globalState.update( 'calendar.google.acknowledgedReminders', acknowledgedReminders );
                        }
                    }
                } );
            }
            else
            {
                vscode.window.showInformationMessage( "Please select an event in the calendar" );
            }
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.setLocation', setLocation ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.setReminder', function( e )
        {
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.clearFilter', clearFilter ) );

        context.subscriptions.push( calendarViewExplorer.onDidExpandElement( function( e ) { calendarTree.setExpanded( e.element.date, true ); } ) );
        context.subscriptions.push( calendarView.onDidExpandElement( function( e ) { calendarTree.setExpanded( e.element.date, true ); } ) );
        context.subscriptions.push( calendarViewExplorer.onDidCollapseElement( function( e ) { calendarTree.setExpanded( e.element.date, false ); } ) );
        context.subscriptions.push( calendarView.onDidCollapseElement( function( e ) { calendarTree.setExpanded( e.element.date, false ); } ) );

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
                    e.affectsConfiguration( 'calendar.reminderInterval' ) ||
                    e.affectsConfiguration( 'calendar.reminderRepeatInterval' ) ||
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
        fetch();
        setAutoRefreshTimer();
        purgeAcknowledgedReminders();
    }

    register();
}

function deactivate()
{
}

exports.activate = activate;
exports.deactivate = deactivate;
