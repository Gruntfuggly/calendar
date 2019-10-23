var vscode = require( 'vscode' );
var path = require( "path" );
var utils = require( './utils' );

var dateNodes = [];
var expandedNodes = {};
var buildCounter = 1;
var nodeCounter = 1;

var DATE = "date";
var EVENT = "event";

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
    return new Date( a.date ) - new Date( b.date );
};

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
            return [ { label: "Nothing found" } ];
        }
        else if( node.type === DATE )
        {
            return node.nodes.filter( function( n ) { return n.visible; } );
        }
        else if( node.type === EVENT )
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
            treeItem.iconPath = this.getIcon( node.icon );
        }

        if( node.nodes && node.nodes.length > 0 )
        {
            treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            if( expandedNodes[ node.date ] !== undefined )
            {
                treeItem.collapsibleState = ( expandedNodes[ node.date ] === true ) ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
            }
            else
            {
                treeItem.collapsibleState = ( this._context.workspaceState.get( 'calendar.expanded' ) ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed );
            }
        }

        treeItem.contextValue = node.contextValue;

        // if( node.clickable )
        // {
        //     treeItem.command = {
        //         command: "calendar-view.open",
        //         title: "",
        //         arguments: [
        //             node.url
        //         ]
        //     };
        // }

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
            return node.date === this;
        }

        var now = new Date();
        var isAllDay = event.start.date !== undefined;
        var startDate = new Date( isAllDay ? event.start.date : event.start.dateTime );
        var multipleDays = event.end.date && utils.daysFrom( startDate, new Date( event.end.date ) ) > 1;

        var dateNode = dateNodes.find( findDate, startDate.withoutTime().toISOString() );

        if( !dateNode || multipleDays )
        {
            dateNode = {
                type: DATE,
                date: startDate.withoutTime().toISOString(),
                id: ( buildCounter * 1000000 ) + nodeCounter++,
                label: utils.dateLabel( startDate ),
                nodes: [],
                visible: true,
                icon: 'calendar',
                isPast: startDate.withoutTime() < now.withoutTime(),
                tooltip: utils.fullDateLabel( startDate, true )
            };

            if( multipleDays === true )
            {
                dateNode.label += " until " + utils.dateLabel( ( new Date( event.end.date ) ).addDays( -1 ) );
            }

            dateNodes.push( dateNode );
            dateNodes.sort( sortByDate );
        }

        var tooltip = ( event.location ? "Location:" + event.location : "" );
        if( event.description )
        {
            tooltip += ( tooltip.trim().length > 0 ? '\n' : '' ) + event.description;
        }

        var label = ( !isAllDay ? startDate.toLocaleTimeString( vscode.env.language, { hour: 'numeric', minute: 'numeric', hour12: true } ) : '' );

        if( !isAllDay && event.end && event.end.dateTime != event.start.dateTime )
        {
            label += " to " + new Date( event.end.dateTime ).toLocaleTimeString( vscode.env.language, { hour: 'numeric', minute: 'numeric', hour12: true } );
        }

        if( label.length > 0 )
        {
            label += ', ';
        }

        label += event.summary;

        var eventNode = {
            type: EVENT,
            event: event,
            label: label,
            id: ( buildCounter * 1000000 ) + nodeCounter++,
            date: startDate.withoutTime().toISOString(),
            url: event.htmlLink,
            tooltip: tooltip,
            visible: true,
            icon: isAllDay ? 'calendar' : 'time',
            contextValue: 'canEdit canDelete',
            source: source,
            isPast: startDate.getTime() < now.getTime()
        };

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
            node.id = ( buildCounter * 1000000 ) + nodeCounter++;
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

    setExpanded( date, expanded )
    {
        expandedNodes[ date ] = expanded;
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
            node.visible = !term || match;

            if( node.nodes )
            {
                this.filter( term, node.nodes );
                node.visible = node.nodes.filter( isVisible ).length > 0;
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
}
exports.CalendarDataProvider = CalendarDataProvider;
