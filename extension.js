
var vscode = require( 'vscode' );
var TreeView = require( "./tree" );
var googleCalendar = require( './google' );
var outlookCalendar = require( './outlook' );
var utils = require( './utils' );

function activate( context )
{
    var refreshTimer;
    var outputChannel;

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
                        vscode.window.showInformationMessage( label + ": " + event.summary );
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
                    calendarTree.add( event );
                } );
                filterTree( context.workspaceState.get( 'calendar.filter' ) );
                calendarTree.refresh();
                setButtons();
                if( !allDayRemindersShown )
                {
                    showAllDayReminders( events );
                }
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

        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.authorize', fetch ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.refresh', refresh ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.expand', expand ) );
        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.collapse', collapse ) );

        context.subscriptions.push( vscode.commands.registerCommand( 'calendar.resetCache', function()
        {
            // function purgeFolder( folder )
            // {
            //     fs.readdir( folder, function( err, files )
            //     {
            //         files.map( function( file )
            //         {
            //             fs.unlinkSync( path.join( folder, file ) );
            //         } );
            //     } );
            // }

            context.workspaceState.update( 'calendar.google.token', undefined );
            context.workspaceState.update( 'calendar.expanded', undefined );
            context.workspaceState.update( 'calendar.filter', undefined );
            context.workspaceState.update( 'calendar.expandedNodes', undefined );

            // purgeFolder( context.globalStoragePath );
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
