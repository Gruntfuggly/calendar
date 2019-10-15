
var vscode = require( 'vscode' );
var fs = require( 'fs' );
var TreeView = require( "./tree" );
var google = require( 'googleapis' ).google;

var OPEN_SETTINGS = "Open Settings";
var GET_CODE = "Get Authorization Code";
var ENTER_CODE = "Enter Authorization Code";

function activate( context )
{
    var outputChannel;
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

    function fetchGoogle()
    {
        var configuration = vscode.workspace.getConfiguration( 'calendar' );
        var credentialsFile = configuration.get( 'google.credentialsFile' );

        // If modifying these scopes, delete token.json.
        var SCOPES = [ 'https://www.googleapis.com/auth/calendar.readonly' ];

        if( !credentialsFile )
        {
            vscode.window.showInformationMessage( 'Please enable the google calendar API', OPEN_SETTINGS ).then( function( button )
            {
                if( button === OPEN_SETTINGS )
                {
                    vscode.commands.executeCommand( 'workbench.action.openSettings', 'calendar.google.credentialsFile' );
                }
            } );
        }
        else
        {
            debug( "Reading credentials from '" + credentialsFile + '"' );
            fs.readFile( credentialsFile, function( error, content )
            {
                if( error )
                {
                    debug( error );
                    vscode.window.showErrorMessage( 'Failed to open credentials file', OPEN_SETTINGS ).then( function( button )
                    {
                        if( button === OPEN_SETTINGS )
                        {
                            vscode.commands.executeCommand( 'workbench.action.openSettings', 'calendar.google.credentialsFile' );
                        }
                    } );
                }
                else
                {
                    debug( "Authorizing" );
                    // Authorize a client with credentials, then call the Google Calendar API.
                    authorize( JSON.parse( content ), listEvents );
                }
            } );
        }

        /**
         * Create an OAuth2 client with the given credentials, and then execute the
         * given callback function.
         * @param {Object} credentials The authorization client credentials.
         * @param {function} callback The callback to call with the authorized client.
         */
        function authorize( credentials, callback )
        {
            var client_secret = credentials.installed.client_secret;
            var client_id = credentials.installed.client_id;
            var redirect_uris = credentials.installed.redirect_uris;

            var oAuth2Client = new google.auth.OAuth2( client_id, client_secret, redirect_uris[ 0 ] );

            var token = context.globalState.get( 'calendar.google.token' );
            if( !token )
            {
                debug( "Getting token" );
                getAccessToken( oAuth2Client, callback );
                return;
            }
            else
            {
                debug( "Token already defined" );
                oAuth2Client.setCredentials( JSON.parse( token ) );
                callback( oAuth2Client );
            }

        }

        /**
         * Get and store new token after prompting for user authorization, and then
         * execute the given callback with the authorized OAuth2 client.
         * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
         * @param {getEventsCallback} callback The callback for the authorized client.
         */
        function getAccessToken( oAuth2Client, callback )
        {
            var authUrl = oAuth2Client.generateAuthUrl( {
                access_type: 'offline',
                scope: SCOPES,
            } );
            debug( "token URL: " + authUrl );
            vscode.window.showInformationMessage( 'Calendar authorization required', GET_CODE, ENTER_CODE ).then( function( action )
            {
                if( action === GET_CODE )
                {
                    vscode.env.openExternal( vscode.Uri.parse( authUrl ) );
                }
                else if( action === ENTER_CODE )
                {
                    vscode.window.showInputBox( { prompt: "Please enter the generated token", placeHolder: "Token" } ).then( function( code )
                    {
                        oAuth2Client.getToken( code, function( error, token )
                        {
                            if( error )
                            {
                                vscode.window.showErrorMessage( 'Error retrieving access token: ' + error );
                            }
                            else
                            {
                                oAuth2Client.setCredentials( token );
                                context.globalState.update( 'calendar.google.token', JSON.stringify( token ) );
                                debug( "Token stored" );
                                callback( oAuth2Client );
                            }
                        } );
                    } );
                }
            } );
        }

        function listEvents( auth )
        {
            var configuration = vscode.workspace.getConfiguration( 'calendar' );

            var calendar = google.calendar( { version: 'v3', auth: auth } );
            calendar.events.list( {
                calendarId: 'primary',
                timeMin: ( new Date() ).toISOString(),
                maxResults: configuration.get( 'maxEvents' ),
                singleEvents: true,
                orderBy: 'startTime',
            }, function( error, results )
            {
                if( error )
                {
                    vscode.window.showErrorMessage( error );
                }
                else
                {
                    var events = results.data.items;
                    if( events.length )
                    {
                        events.map( function( event, i )
                        {
                            debug( "Event:" + JSON.stringify( event ) );
                            calendarTree.add( event );
                        } );
                    }
                    filterTree( context.workspaceState.get( 'calendar.filter' ) );
                    calendarTree.refresh();
                    setButtons();
                }
            } );
        }
    }

    function fetch()
    {
        fetchGoogle();
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
    }

    register();
}

function deactivate()
{
}

exports.activate = activate;
exports.deactivate = deactivate;
