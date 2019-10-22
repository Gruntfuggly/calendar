var vscode = require( 'vscode' );

Date.prototype.withoutTime = function()
{
    var d = new Date( this );
    d.setHours( 0, 0, 0, 0 );
    return d;
};

function daysBetween( startDate, endDate )
{
    // Original function by https://stackoverflow.com/users/2596252/rmcmullan

    // The number of milliseconds in all UTC days (no DST)
    var ONE_DAY = 24 * 60 * 60 * 1000;

    // A day in UTC always lasts 24 hours (unlike in other time formats)
    var start = Date.UTC( endDate.getFullYear(), endDate.getMonth(), endDate.getDate() );
    var end = Date.UTC( startDate.getFullYear(), startDate.getMonth(), startDate.getDate() );

    // so it's safe to divide by 24 hours
    return Math.abs( ( start - end ) / ONE_DAY );
}

function isToday( date )
{
    var today = new Date().withoutTime();
    return date.withoutTime().getTime() === today.getTime();
}

function isTomorrow( date )
{
    var today = new Date().withoutTime();
    var tomorrow = new Date( today.getFullYear(), today.getMonth(), today.getDate() + 1 );
    return date.withoutTime().getTime() === tomorrow.getTime();
}

function fullDateLabel( date )
{
    var targetDate = date.withoutTime();
    var today = new Date().withoutTime();

    var withoutYear = { weekday: 'long', month: 'long', day: 'numeric' };
    var withYear = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return targetDate.getYear() == today.getYear() ?
        date.toLocaleString( vscode.env.language, withoutYear )
        : date.toLocaleString( vscode.env.language, withYear );
}

function dateLabel( date )
{
    var targetDate = date.withoutTime();
    var today = new Date().withoutTime();

    if( vscode.workspace.getConfiguration( 'calendar' ).get( 'showRelativeDates' ) )
    {
        if( isToday( date ) )
        {
            return "Today";
        }
        else if( isTomorrow( date ) )
        {
            return "Tomorrow";
        }
        else if( daysBetween( targetDate, today ) < 8 )
        {
            var options = { weekday: 'long' };
            return date.toLocaleString( vscode.env.language, options );
        }
    }

    return fullDateLabel( date );
}

module.exports.daysBetween = daysBetween;
module.exports.isToday = isToday;
module.exports.isTomorrow = isTomorrow;
module.exports.fullDateLabel = fullDateLabel;
module.exports.dateLabel = dateLabel;
