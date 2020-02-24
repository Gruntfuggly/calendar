var vscode = require( 'vscode' );
var path = require( "path" );
var utils = require( './utils' );

var dateNodes = [];
var expandedNodes = {};
var buildCounter = 1;
var nodeCounter = 1;

var DATE = "DATE";
var EVENT = "EVENT";
var LOCATION = "LOCATION";
var REMINDER = "REMINDER";

Date.prototype.withoutTime = function()
{
    var d = new Date( this );
    d.setHours( 0, 0, 0, 0 );
    return d;
};

var isVisible = function( node )
{
    return node.visible === true;
};

var sortByDate = function( a, b )
{
    return new Date( a.startDate ) - new Date( b.startDate );
};

var sortByReminderTime = function( a, b )
{
    return a.minutesBefore - b.minutesBefore;
};

function newNodeId()
{
    return ( buildCounter * 1000000 ) + nodeCounter++;
}

class CalendarDataProvider
{
    constructor( _context, outputChannel )
    {
        this._context = _context;
        this.outputChannel = outputChannel;

        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        buildCounter = _context.workspaceState.get( 'buildCounter', 1 );
        expandedNodes = _context.workspaceState.get( 'calendar.expandedNodes', {} );
    }

    debug( text )
    {
        if( this.outputChannel )
        {
            this.outputChannel.appendLine( text );
        }
    }

    hasContent()
    {
        return dateNodes.length > 0;
    }

    getChildren( node )
    {
        if( !node )
        {
            var roots = dateNodes.filter( function( n ) { return n.visible; } );
            if( roots.length > 0 )
            {
                return roots;
            }
            return [];
        }
        else if( node.type === DATE )
        {
            return node.nodes.filter( function( n ) { return n.visible; } );
        }
        else if( node.type === EVENT )
        {
            var children = node.nodes.filter( function( n ) { return n.visible; } );
            if( children.length > 0 )
            {
                return children;
            }
            return node.text;
        }
        else if( node.type === DETAILS )
        {
            return node.text;
        }
    }

    getIcon( name )
    {
        var icon = {
            dark: this._context.asAbsolutePath( path.join( "resources/icons", "dark", name + ".svg" ) ),
            light: this._context.asAbsolutePath( path.join( "resources/icons", "light", name + ".svg" ) )
        };

        return icon;
    }

    getParent( node )
    {
        return node.parent;
    }

    getTreeItem( node )
    {
        var treeItem = new vscode.TreeItem( node.label );

        treeItem.id = node.id;
        treeItem.tooltip = node.tooltip;

        treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;

        if( node.isPast )
        {
            treeItem.label = "";
            treeItem.description = node.label;
        }

        if( node.icon )
        {
            if( node.type === DATE && node.nodes && node.nodes.length === 1 )
            {
                treeItem.iconPath = this.getIcon( node.nodes[ 0 ].icon );
            }
            else
            {
                treeItem.iconPath = this.getIcon( node.icon );
            }
        }

        if( node.type === DATE && node.nodes && node.nodes.length === 1 )
        {
            treeItem.tooltip = node.nodes[ 0 ].label;
        }

        if( node.nodes && node.nodes.length > 0 )
        {
            treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            var nodeId = node.startDate + ( node.endDate ? node.endDate : "" );
            if( expandedNodes[ nodeId ] !== undefined )
            {
                treeItem.collapsibleState = ( expandedNodes[ nodeId ] === true ) ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
            }
            else
            {
                treeItem.collapsibleState = ( this._context.workspaceState.get( 'calendar.expanded' ) ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed );
            }
        }

        treeItem.contextValue = node.contextValue;

        return treeItem;
    }

    clear()
    {
        dateNodes = [];
    }

    add( event, source )
    {
        function findDate( node )
        {
            return node.label === this.label;
        }

        var now = new Date();
        var isAllDay = event.start.date !== undefined;
        var startDate = new Date( isAllDay ? event.start.date : event.start.dateTime );
        var endDate;
        if( event.end && event.end.date )
        {
            endDate = ( new Date( event.end.date ) ).addDays( -1 );
        }
        var multipleDays = event.end.date && utils.daysFrom( startDate, new Date( event.end.date ) ) > 1;
        var dateLabel = utils.dateLabel( startDate );
        var dateNode = dateNodes.find( findDate, {
            label: dateLabel
        } );

        var isDatePast = startDate.withoutTime() < now.withoutTime();

        if( !dateNode || multipleDays )
        {
            dateNode = {
                type: DATE,
                startDate: startDate.withoutTime().toISOString(),
                endDate: endDate ? endDate.withoutTime().toISOString() : undefined,
                id: newNodeId(),
                label: dateLabel,
                nodes: [],
                visible: true,
                icon: 'calendar',
                isPast: isDatePast,
                tooltip: utils.fullDateLabel( startDate, true )
            };

            if( multipleDays === true )
            {
                dateNode.label += " until " + utils.dateLabel( endDate );
            }

            dateNodes.push( dateNode );
            dateNodes.sort( sortByDate );
        }

        var tooltip = ( event.location ? "Location:" + event.location : "" );
        if( event.description )
        {
            tooltip += ( tooltip.trim().length > 0 ? '\n' : '' ) + event.description;
        }

        var label = ( !isAllDay ? utils.formattedTime( startDate ) : '' );

        if( !isAllDay && event.end && event.end.dateTime != event.start.dateTime )
        {
            label += " to " + utils.formattedTime( new Date( event.end.dateTime ) );
        }

        if( label.length > 0 )
        {
            label += ', ';
        }

        label += event.summary;

        var isEventPast = isDatePast || ( !isAllDay && startDate.getTime() < now.getTime() );

        var eventNode = {
            type: EVENT,
            event: event,
            label: label,
            id: newNodeId(),
            url: event.htmlLink,
            tooltip: tooltip,
            visible: true,
            icon: isAllDay ? 'calendar' : 'time',
            contextValue: 'canEdit canDelete canOpen canSetLocation canSetReminder',
            source: source,
            isPast: isEventPast,
            nodes: []
        };

        if( event.reminders && !event.reminders.useDefault && event.reminders.overrides )
        {
            event.reminders.overrides.map( function( reminder, index )
            {
                var reminderDateTime = new Date( startDate.getTime() - reminder.minutes * 60000 );
                var reminderNode = {
                    type: REMINDER,
                    event: event,
                    label: "Reminder by " + reminder.method + " at " + utils.formattedTime( reminderDateTime ) + " on " + reminderDateTime.toLocaleDateString( utils.getLocale() ),
                    id: newNodeId(),
                    visible: true,
                    icon: 'reminder',
                    contextValue: 'canEdit canDelete canSetReminder',
                    minutesBefore: parseInt( reminder.minutes ),
                    reminderIndex: index,
                    source: source,
                    isPast: startDate.getTime() < now.getTime()
                };

                eventNode.nodes.push( reminderNode );
            } );

            eventNode.nodes.sort( sortByReminderTime ).reverse();
        }

        if( event.location )
        {
            var locationNode = {
                type: LOCATION,
                event: event,
                label: "Location: " + event.location,
                id: newNodeId(),
                visible: true,
                icon: 'location',
                contextValue: 'canEdit canDelete canSetLocation',
                source: source,
                isPast: startDate.getTime() < now.getTime(),
            }

            eventNode.nodes.push( locationNode );
        }

        var icons = [
            { 'keywords': 'anniversary,party', 'icon': 'anniversary' },
            { 'keywords': 'birthday', 'icon': 'birthday' },
            { 'keywords': 'cinema,movie,movies', 'icon': 'cinema' },
            { 'keywords': 'dentist,dentists,dental,hygienist', 'icon': 'dentist' },
            { 'keywords': 'breakfast,lunch,dinner,meal,restaurant,food', 'icon': 'food' },
            { 'keywords': 'dr,doctor,doctors,hospital', 'icon': 'doctor' },
            { 'keywords': 'car,garage,mot', 'icon': 'car' },
            { 'keywords': 'flight,plane,airport,holiday,holidays,vacation', 'icon': 'airplane' },

        ];
        icons.map( function( icon )
        {
            icon.keywords.split( ',' ).map( function( keyword )
            {
                if( event.summary.match( new RegExp( '\\b' + keyword + '\\b', 'i' ) ) )
                {
                    eventNode.icon = icon.icon;
                }
            } );
        } );

        dateNode.nodes.push( eventNode );
    }

    rebuild( nodes )
    {
        if( nodes === undefined )
        {
            nodes = dateNodes;
        }
        nodes.forEach( function( node )
        {
            node.id = newNodeId();
            if( node.nodes )
            {
                this.rebuild( node.nodes );
            }
        }, this );
    }

    refresh()
    {
        buildCounter += 1;
        nodeCounter = 1;
        this.rebuild();
        this._onDidChangeTreeData.fire();
        vscode.commands.executeCommand( 'setContext', 'calendar-tree-has-content', dateNodes.length > 0 );
    }

    setExpanded( node, expanded )
    {
        var nodeId = node.startDate + ( node.endDate ? node.endDate : "" );
        expandedNodes[ nodeId ] = expanded;
        this._context.workspaceState.update( 'calendar.expandedNodes', expandedNodes );
    }

    clearExpansionState()
    {
        expandedNodes = {};
        this._context.workspaceState.update( 'calendar.expandedNodes', expandedNodes );
    }

    filter( term, nodes )
    {
        var matcher = new RegExp( term, 'i' );

        if( nodes === undefined )
        {
            nodes = dateNodes;
        }
        nodes.forEach( function( node )
        {
            var match = matcher.test( node.label );

            if( !match && node.nodes )
            {
                this.filter( term, node.nodes );
                node.visible = node.nodes.filter( isVisible ).length > 0;
            }
            else
            {
                node.visible = !term || match;
            }
        }, this );
    }

    clearFilter( nodes )
    {
        if( nodes === undefined )
        {
            nodes = dateNodes;
        }
        nodes.forEach( function( node )
        {
            node.visible = true;
            if( node.nodes )
            {
                this.clearFilter( node.nodes );
            }
        }, this );
    }

    isEventNode( node )
    {
        return node && node.type === EVENT;
    }

    isReminderNode( node )
    {
        return node && node.type === REMINDER;
    }

    isLocationNode( node )
    {
        return node && node.type === LOCATION;
    }
}
exports.CalendarDataProvider = CalendarDataProvider;