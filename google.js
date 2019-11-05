var vscode = require( 'vscode' );
var fs = require( 'fs' );
var google = require( 'googleapis' ).google;
var utils = require( './utils' );

var OPEN_SETTINGS = "Open Settings";
var GET_CODE = "Get Authorization Code";
var ENTER_CODE = "Enter Authorization Code";

var oAuth2Client;

var defaultDebug = function( text )
{
    console.log( text );
};

var debug = defaultDebug;

function init( _debug )
{
    debug = _debug === undefined ? defaultDebug : _debug;
}

function fetch( populateTree, context )
{
    var configuration = vscode.workspace.getConfiguration( 'calendar' );
    var credentialsFile = configuration.get( 'google.credentialsFile' );

    var SCOPES = [
        'https://www.googleapis.com/auth/calendar.events'
    ];

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

        oAuth2Client = new google.auth.OAuth2( client_id, client_secret, redirect_uris[ 0 ] );

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
            callback();
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
        vscode.window.showInformationMessage( 'Google calendar authorization required', GET_CODE, ENTER_CODE ).then( function( action )
        {
            if( action === GET_CODE )
            {
                vscode.env.openExternal( vscode.Uri.parse( authUrl ) );
            }
            else if( action === ENTER_CODE )
            {
                vscode.window.showInputBox( { prompt: "Please enter the generated token", placeHolder: "Token" } ).then( function( code )
                {
                    if( code )
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
                                callback();
                            }
                        } );
                    }
                } );
            }
        } );
    }

    function listEvents()
    {
        var configuration = vscode.workspace.getConfiguration( 'calendar' );

        var calendar = google.calendar( { version: 'v3', auth: oAuth2Client } );
        var from = new Date();
        var historicDays = configuration.get( 'historicDays', 0 );
        if( historicDays > 0 )
        {
            from.setDate( from.getDate() - historicDays );
        }

        calendar.events.list( {
            calendarId: 'primary',
            timeMin: from.toISOString(),
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
                populateTree( results.data.items );
            }
        } );
    }
}

function isAllDay( event )
{
    return event.start.date !== undefined;
}

function createEvent( callback, summary, eventDateTime )
{
    var configuration = vscode.workspace.getConfiguration( 'calendar' );

    var calendar = google.calendar( { version: 'v3', auth: oAuth2Client } );
    var newEvent;

    if( eventDateTime.allDay )
    {
        newEvent = {
            summary: summary,
            // location: '800 Howard St., San Francisco, CA 94103',
            // description: "A chance to hear more about Google's developer products.",
            start: {
                date: utils.toISODate( eventDateTime.start )
            },
            end: {
                date: utils.toISODate( ( eventDateTime.end ? eventDateTime.end : eventDateTime.start ).addDays( 1 ) )
            }
        };
    }
    else
    {
        newEvent = {
            summary: summary,
            start: {
                dateTime: eventDateTime.start
            },
            end: {
                dateTime: eventDateTime.end ? eventDateTime.end : eventDateTime.start
            }
        };
    }

    if( configuration.get( 'google.useDefaultReminders', true ) === false )
    {
        newEvent.reminders = { useDefault: false };
    }

    debug( "requested event: " + JSON.stringify( newEvent ) );

    calendar.events.insert(
        {
            auth: oAuth2Client,
            calendarId: 'primary',
            resource: newEvent
        },
        function( error, result )
        {
            if( error )
            {
                vscode.window.showInformationMessage( "Failed to create event: " + error );
                debug( error );
            }
            else
            {
                vscode.window.showInformationMessage( "Event created" );
                debug( JSON.stringify( result ) );
                callback();
            }

        }
    );
}

function editEvent( callback, eventId, summary, eventDateTime )
{
    var calendar = google.calendar( { version: 'v3', auth: oAuth2Client } );
    var updatedEvent;

    if( eventDateTime.allDay )
    {
        updatedEvent = {
            summary: summary,
            // location: '800 Howard St., San Francisco, CA 94103',
            // description: "A chance to hear more about Google's developer products.",
            start: {
                date: toISODate( eventDateTime.start )
            },
            end: {
                date: toISODate( ( eventDateTime.end ? eventDateTime.end : eventDateTime.start ).addDays( 1 ) )
            }
        };
    }
    else
    {
        updatedEvent = {
            summary: summary,
            start: {
                dateTime: eventDateTime.start
            },
            end: {
                dateTime: eventDateTime.end ? eventDateTime.end : eventDateTime.start
            }
        };
    }

    debug( "requested event: " + JSON.stringify( updatedEvent ) );

    calendar.events.update(
        {
            auth: oAuth2Client,
            calendarId: 'primary',
            eventId: eventId,
            resource: updatedEvent
        },
        function( error, result )
        {
            if( error )
            {
                vscode.window.showInformationMessage( "Failed to update event: " + error );
                debug( error );
            }
            else
            {
                vscode.window.showInformationMessage( "Event updated" );
                debug( JSON.stringify( result ) );
                callback();
            }
        }
    );
}

function updateEvent( callback, event )
{
    var calendar = google.calendar( { version: 'v3', auth: oAuth2Client } );
    debug( "requested event: " + JSON.stringify( event ) );

    calendar.events.update(
        {
            auth: oAuth2Client,
            calendarId: 'primary',
            eventId: event.id,
            resource: event
        },
        function( error, result )
        {
            if( error )
            {
                vscode.window.showInformationMessage( "Failed to update event: " + error );
                debug( error );
            }
            else
            {
                vscode.window.showInformationMessage( "Event updated" );
                debug( JSON.stringify( result ) );
                callback();
            }
        }
    );
}

function deleteEvent( callback, eventId )
{
    var calendar = google.calendar( { version: 'v3', auth: oAuth2Client } );

    calendar.events.delete(
        {
            auth: oAuth2Client,
            calendarId: 'primary',
            eventId: eventId
        },
        function( error, result )
        {
            vscode.window.showInformationMessage( error ? ( "Failed to remove event: " + error ) : "Event removed" );
            debug( "deleteEvent result: " + ( error ? error : JSON.stringify( result ) ) );
            if( !error )
            {
                callback();
            }
        }
    );
}

function setLocation( callback, event, location )
{
    var calendar = google.calendar( { version: 'v3', auth: oAuth2Client } );

    event.location = location;

    calendar.events.update(
        {
            auth: oAuth2Client,
            calendarId: 'primary',
            eventId: event.id,
            resource: event
        },
        function( error, result )
        {
            if( error )
            {
                vscode.window.showInformationMessage( "Failed to update event: " + error );
                debug( error );
            }
            else
            {
                vscode.window.showInformationMessage( "Event updated" );
                debug( JSON.stringify( result ) );
                callback();
            }
        }
    );
}

function deleteReminder( callback, event, reminderIndex )
{
    var calendar = google.calendar( { version: 'v3', auth: oAuth2Client } );

    event.reminders.overrides.splice( reminderIndex, 1 );

    calendar.events.update(
        {
            auth: oAuth2Client,
            calendarId: 'primary',
            eventId: event.id,
            resource: event
        },
        function( error, result )
        {
            if( error )
            {
                vscode.window.showInformationMessage( "Failed to update event: " + error );
                debug( error );
            }
            else
            {
                vscode.window.showInformationMessage( "Event updated - reminder removed" );
                debug( JSON.stringify( result ) );
                callback();
            }
        }
    );
}

function setReminder( callback, event, reminderIndex, reminder )
{
    var calendar = google.calendar( { version: 'v3', auth: oAuth2Client } );

    if( reminderIndex !== undefined )
    {
        event.reminders.overrides[ reminderIndex ] = reminder;
    }
    else
    {
        if( !event.reminders.overrides )
        {
            event.reminders.useDefault = false;
            event.reminders.overrides = [];
        }
        event.reminders.overrides.push( reminder );
    }

    calendar.events.update(
        {
            auth: oAuth2Client,
            calendarId: 'primary',
            eventId: event.id,
            resource: event
        },
        function( error, result )
        {
            if( error )
            {
                vscode.window.showInformationMessage( "Failed to update event: " + error );
                debug( error );
            }
            else
            {
                vscode.window.showInformationMessage( "Event updated - reminder " + ( reminder.index ? "updated" : "added" ) );
                debug( JSON.stringify( result ) );
                callback();
            }
        }
    );
}

module.exports.init = init;
module.exports.fetch = fetch;
module.exports.isAllDay = isAllDay;
module.exports.createEvent = createEvent;
module.exports.editEvent = editEvent;
module.exports.updateEvent = updateEvent;
module.exports.deleteEvent = deleteEvent;
module.exports.setLocation = setLocation;
module.exports.deleteReminder = deleteReminder;
module.exports.setReminder = setReminder;
