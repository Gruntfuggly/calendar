var vscode = require( 'vscode' );

var localeRegex = new RegExp( '^[a-z]{2}([\-][a-z]{2})*$', 'i' );

Date.prototype.withoutTime = function()
{
    var d = new Date( this );
    d.setHours( 0, 0, 0, 0 );
    return d;
};

Date.prototype.addDays = function( days )
{
    var date = new Date( this.valueOf() );
    date.setDate( date.getDate() + days );
    return date;
};

function isValidLocale( locale )
{
    return locale.match( localeRegex );
}

function getLocale()
{
    var locale = vscode.workspace.getConfiguration( 'calendar' ).get( 'locale', vscode.env.language );
    if( isValidLocale( locale ) )
    {
        return locale;
    }
    return vscode.env.language;
}

function toISODate( date )
{
    var offset = date.getTimezoneOffset();
    var adjustedDate = new Date( date.getTime() + ( offset * 60 * 1000 ) );
    return adjustedDate.toISOString().split( 'T' )[ 0 ];
}

function daysFrom( startDate, endDate )
{
    // Original function by https://stackoverflow.com/users/2596252/rmcmullan

    // The number of milliseconds in all UTC days (no DST)
    var ONE_DAY = 24 * 60 * 60 * 1000;

    // A day in UTC always lasts 24 hours (unlike in other time formats)
    var start = Date.UTC( endDate.getFullYear(), endDate.getMonth(), endDate.getDate() );
    var end = Date.UTC( startDate.getFullYear(), startDate.getMonth(), startDate.getDate() );

    // so it's safe to divide by 24 hours
    return ( start - end ) / ONE_DAY;
}

function isToday( date )
{
    var today = new Date().withoutTime();
    return date.withoutTime().getTime() === today.getTime();
}

function isYesterday( date )
{
    var today = new Date().withoutTime();
    var yesterday = new Date( today.getFullYear(), today.getMonth(), today.getDate() - 1 );
    return date.withoutTime().getTime() === yesterday.getTime();
}

function isTomorrow( date )
{
    var today = new Date().withoutTime();
    var tomorrow = new Date( today.getFullYear(), today.getMonth(), today.getDate() + 1 );
    return date.withoutTime().getTime() === tomorrow.getTime();
}

function fullDateLabel( date, withYear )
{
    var targetDate = date.withoutTime();
    var today = new Date().withoutTime();

    var withoutYearFormat = { weekday: 'long', month: 'long', day: 'numeric' };
    var withYearFormat = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleString( getLocale(), ( targetDate.getYear() !== today.getYear() || withYear ) ? withYearFormat : withoutYearFormat );
}

function dateLabel( date )
{
    var targetDate = date.withoutTime();
    var today = new Date().withoutTime();

    if( vscode.workspace.getConfiguration( 'calendar' ).get( 'showRelativeDates' ) )
    {
        var difference = daysFrom( today, targetDate );

        if( isYesterday( date ) )
        {
            return "Yesterday";
        }
        else if( difference < 0 )
        {
            return "Last " + date.toLocaleString( getLocale(), { weekday: 'long' } );
        }
        else if( isToday( date ) )
        {
            return "Today";
        }
        else if( isTomorrow( date ) )
        {
            return "Tomorrow";
        }
        else if( difference < 8 )
        {
            return date.toLocaleString( getLocale(), { weekday: 'long' } );
        }
    }

    return fullDateLabel( date );
}

function formattedTime( date )
{
    return date.toLocaleTimeString( getLocale(), { hour: 'numeric', minute: 'numeric', hour12: true } )
}

module.exports.isValidLocale = isValidLocale;
module.exports.getLocale = getLocale;
module.exports.toISODate = toISODate;
module.exports.daysFrom = daysFrom;
module.exports.isToday = isToday;
module.exports.isTomorrow = isTomorrow;
module.exports.fullDateLabel = fullDateLabel;
module.exports.dateLabel = dateLabel;
module.exports.formattedTime = formattedTime;
