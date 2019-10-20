var credentials = {
    client: {
        id: process.env.APP_ID,
        secret: process.env.APP_PASSWORD,
    },
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
        redirect_uri: process.env.REDIRECT_URI,
        scope: process.env.APP_SCOPES
    } );
    console.log( `Generated auth url: ${returnVal}` );
    return returnVal;
}

exports.setCredentials = setCredentials;
exports.getAuthUrl = getAuthUrl;