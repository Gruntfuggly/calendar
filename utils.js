Date.prototype.withoutTime = function()
{
    var d = new Date( this );
    d.setHours( 0, 0, 0, 0 );
    return d;
};

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

module.exports.isToday = isToday;
module.exports.isTomorrow = isTomorrow;