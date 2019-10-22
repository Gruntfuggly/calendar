
var vscode = require( 'vscode' );
var chrono = require( 'chrono-node' );
var googleCalendar = require( './google' );
var outlookCalendar = require( './outlook' );
var TreeView = require( './tree' );
var utils = require( './utils' );

var GOOGLE = 'GOOGLE';
var OUTLOOK = 'OUTLOOK';
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
            debug( "Ready" );
        }
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
                        var label = isToday ? "Today" : "Tomorrow";
                        if( vscode.workspace.getConfiguration( 'calendar' ).get( 'stickyReminders' ) )
                        {
                            vscode.window.showErrorMessage( label + ": " + event.summary, "OK" );
                        }
                        else
                        {
                            vscode.window.showInformationMessage( label + ": " + event.summary );
                        }
                    }
                }
            } );
        }
        allDayRemindersShown = true;
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
                        reminders[ event.id ] = setTimeout( function( event )
                        {
                            debug( "Showing notification for " + event.summary );
                            var eventTime = new Date( event.start.dateTime );
                            var text = eventTime.toLocaleTimeString( vscode.env.language, { hour: 'numeric', minute: 'numeric', hour12: true } ) + ": " + event.summary;
                            if( vscode.workspace.getConfiguration( 'calendar' ).get( 'stickyReminders' ) )
                            {
                                vscode.window.showErrorMessage( text, "OK" );
                            }
                            else
                            {
                                vscode.window.showInformationMessage( text );
                            }
                        }, millisecondsUntilReminder, event );
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
                setButtons();
                if( !allDayRemindersShown )
                {
                    showAllDayReminders( events );
                }
                showReminders( events );
            }, context, debug );
        }

        if( config.get( 'outlook.enabled' ) )
        {
            outlookCalendar.setCredentials(
                config.get( 'outlook.clientId' ),
                config.get( 'outlook.clientSecret' ) );

            outlookCalendar.fetch( function( events )
            {
            }, context, debug );
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
            setButtons();
        } );
    }

    function setButtons()
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
            setButtons();
        } );
    }

    function expand()
    {
        context.workspaceState.update( 'calendar.expanded', true ).then( function()
        {
            calendarTree.clearExpansionState();
            calendarTree.refresh();
            setButtons();
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
        setButtons();
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

        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.search', function()
        {
            vscode.window.showInputBox( { prompt: "Search the calendar" } ).then( function( term )
            {
                context.workspaceState.update( 'calendar.filter', term ).then( function()
                {
                    filterTree( term );
                } );
            } );
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.createEvent', function()
        {
            vscode.window.showInputBox( { prompt: "Please enter an event description" } ).then( function( summary )
            {
                if( summary )
                {
                    var status = vscode.window.createStatusBarItem();
                    status.text = "Creating event...";
                    status.show();

                    vscode.window.showInputBox( {
                        prompt: "Please enter the date and time of the event",
                        placeHolder: "E.g., Tomorrow at 6.30pm",
                        validateInput: function( value )
                        {
                            var parsed = chrono.parse( value, new Date(), { forwardDate: true } );
                            if( parsed.length > 0 )
                            {
                                status.text = "Creating event at " + parsed[ 0 ].start.date().toLocaleString();
                                return "";
                            }
                            status.text = "Creating event...";
                            return "Date and time not understood (yet)";
                        }
                    } ).then( function( dateTime )
                    {
                        status.dispose();
                        if( dateTime !== undefined )
                        {
                            var parsed = chrono.parse( dateTime, new Date(), { forwardDate: true } );
                            if( parsed.length > 0 )
                            {
                                var eventDate = parsed[ 0 ].start.date();
                                var config = vscode.workspace.getConfiguration( 'calendar' );

                                if( config.get( 'google.enabled' ) )
                                {
                                    googleCalendar.createEvent( summary, eventDate, debug, function( message )
                                    {
                                        vscode.window.showInformationMessage( message );
                                        refresh();
                                    } );
                                }
                            }
                            else
                            {
                                vscode.window.showErrorMessage( "Failed to parse date and time" );
                            }
                        }
                    } );
                }
            } );
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.editEvent', function( e )
        {
            vscode.window.showInputBox( {
                prompt: "Please modify the event description, if required",
                value: e.event.summary
            } ).then( function( summary )
            {
                if( summary )
                {
                    var isAllDay = e.event.start.date !== undefined;
                    var originalDateTime = new Date( isAllDay ? e.event.start.date : e.event.start.dateTime );
                    var originalText = utils.dateLabel( originalDateTime );
                    if( !isAllDay )
                    {
                        originalText += ' ' + originalDateTime.toLocaleTimeString();
                    }

                    var status = vscode.window.createStatusBarItem();
                    status.text = "Updating event...";
                    status.show();

                    vscode.window.showInputBox( {
                        prompt: "Please update the date and time of the event",
                        value: originalText,
                        placeHolder: "E.g., Tomorrow at 6.30pm",
                        validateInput: function( value )
                        {
                            var parsed = chrono.parse( value, new Date(), { forwardDate: true } );
                            if( parsed.length > 0 )
                            {
                                status.text = "Updating event to " + parsed[ 0 ].start.date().toLocaleString();
                                return "";
                            }
                            status.text = "Updating event...";
                            return "Date and time not understood (yet)";
                        }
                    } ).then( function( dateTime )
                    {
                        status.dispose();
                        if( dateTime !== undefined )
                        {
                            var parsed = chrono.parse( dateTime, new Date(), { forwardDate: true } );
                            if( parsed.length > 0 )
                            {
                                var eventDate = parsed[ 0 ].start.date();

                                if( e.source === GOOGLE )
                                {
                                    googleCalendar.editEvent( e.event.id, summary, eventDate, debug, function( message )
                                    {
                                        vscode.window.showInformationMessage( message );
                                        refresh();
                                    } );
                                }
                            }
                            else
                            {
                                vscode.window.showErrorMessage( "Failed to parse date and time" );
                            }
                        }
                    } );
                }
            } );
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.deleteEvent', function( e )
        {
            vscode.window.showInformationMessage( "Are you sure you want to delete this event?", 'Yes', 'No' ).then( function( confirm )
            {
                if( confirm === 'Yes' )
                {
                    if( e.source === GOOGLE )
                    {
                        googleCalendar.deleteEvent( e.event.id, debug, function( message )
                        {
                            vscode.window.showInformationMessage( message );
                            refresh();
                        } );
                    }
                }
            } );
        } ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.setLocation', function( e )
        {
        } ) );

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
                else if( e.affectsConfiguration( 'calendar.autoRefreshInterval' ) )
                {
                    setAutoRefreshTimer()
                }
                else if(
                    e.affectsConfiguration( 'calendar.google.credentialsFile' ) ||
                    e.affectsConfiguration( 'calendar.maxEvents' ) ||
                    e.affectsConfiguration( 'calendar.showRelativeDates' ) )
                {
                    refresh();
                }
            }
        } ) );

        context.subscriptions.push( outputChannel );

        resetOutputChannel();
        setButtons();
        fetch();
        setAutoRefreshTimer();
    }

    register();
}

function deactivate()
{
}

exports.activate = activate;
exports.deactivate = deactivate;
