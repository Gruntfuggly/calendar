var vscode = require( 'vscode' );

// var OPEN_SETTINGS = "Open Settings";
var GET_CODE = "Get Authorization Code";
var ENTER_CODE = "Enter Authorization Code";

var credentials = {
    auth: {
        tokenHost: 'https://login.microsoftonline.com',
        authorizePath: 'common/oauth2/v2.0/authorize',
        tokenPath: 'common/oauth2/v2.0/token'
    }
};
var oauth2;

function setCredentials( clientId, secret )
{
    credentials.client = {
        id: clientId,
        secret: secret
    };
    oauth2 = require( 'simple-oauth2' ).create( credentials );
}

function getAuthUrl()
{
    var returnVal = oauth2.authorizationCode.authorizeURL( {
        redirect_uri: 'https://login.microsoftonline.com/common/oauth2/nativeclient',
        scope: 'openid profile User.Read Calendars.Read'
    } );
    console.log( `Generated auth url: ${returnVal}` );
    return returnVal;
}

function fetch( populateTree, context, debug )
{
    // debug( "token URL: " + authUrl );
    vscode.window.showInformationMessage( 'Outlook calendar authorization required', GET_CODE, ENTER_CODE ).then( function( action )
    {
        if( action === GET_CODE )
        {
            vscode.env.openExternal( vscode.Uri.parse( getAuthUrl() ) );
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
                        context.globalState.update( 'calendar.outlook.token', JSON.stringify( token ) );
                        debug( "Token stored" );
                        callback( oAuth2Client );
                    }
                } );
            } );
        }
    } );
}

async function getTokenFromCode( auth_code )
{
    let result = await oauth2.authorizationCode.getToken( {
        code: auth_code,
        redirect_uri: process.env.REDIRECT_URI,
        scope: process.env.APP_SCOPES
    } );

    const token = oauth2.accessToken.create( result );
    console.log( 'Token created: ', token.token );
    return token.token.access_token;
}

exports.getTokenFromCode = getTokenFromCode;
exports.setCredentials = setCredentials;
exports.getAuthUrl = getAuthUrl;
exports.fetch = fetch;