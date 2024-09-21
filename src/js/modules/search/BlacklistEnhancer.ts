import { Danbooru } from "../../components/api/Danbooru";
import { Blacklist } from "../../components/data/Blacklist";
import { PageDefinition } from "../../components/data/Page";
import { Post } from "../../components/post/Post";
import { PostFilter } from "../../components/post/PostFilter";
import { RE6Module, Settings } from "../../components/RE6Module";
import { Util } from "../../components/utility/Util";
import { BetterSearch } from "./BetterSearch";

/**
 * Blacklist Enhancer  
 * Replaces e6 blacklist functionality
 */
export class BlacklistEnhancer extends RE6Module {

    private static $wrapper: JQuery<HTMLElement>;               // wrapper for the rest of the content
    private static $header: JQuery<HTMLElement>;                // interactive header for the blacklist
    private static $content: JQuery<HTMLElement>;               // list of applicable filters
    private static $toggle: JQuery<HTMLElement>;                // toggle switch for all blacklists

    public constructor() {
        super([PageDefinition.search, PageDefinition.favorites], true, false, [BetterSearch]);
    }

    public getDefaultSettings(): Settings {
        return {
            enabled: true,
            favorites: false,
            uploads: false,
            whitelist: "",
        }
    }

    public create(): void {
        super.create();

        // Override default blacklist function
        Danbooru.Blacklist.stub_vanilla_functions();
        Danbooru.Blacklist.initialize_disable_all_blacklists();
        $("#blacklisted-hider").remove();

        // Content wrapper
        // Clean up the vanilla attributes and styles, or things will go poorly
        BlacklistEnhancer.$wrapper = $("#blacklist-box")
            .attr({
                "open": false,
                "count": 0,
                "discount": 0,
                "collapsed": Util.LS.getItem("bc") == "1",
            })
            .removeAttr("style")
            .removeAttr("class")
            .appendTo("#re621-search")
            .html("");

        // Clickable header
        // Should remember its state between page loads
        BlacklistEnhancer.$header = $("<blacklist-header>")
            .html("Blacklisted")
            .appendTo(BlacklistEnhancer.$wrapper)
            .on("click.re621", () => {
                const collapsed = !(BlacklistEnhancer.$wrapper.attr("collapsed") == "true");
                BlacklistEnhancer.$wrapper.attr("collapsed", collapsed + "");
                Util.LS.setItem("bc", collapsed ? "1" : "0");
                $("#sidebar").trigger("re621:reflow");
            });

        // Blacklist Filters
        // Click to disable individually
        BlacklistEnhancer.$content = $("<blacklist-content>")
            .appendTo(BlacklistEnhancer.$wrapper);

        BlacklistEnhancer.$content.on("click.re621", "a", (event) => {
            event.preventDefault();

            const $target = $(event.currentTarget).parent();
            const enabled = !($target.attr("enabled") == "true");
            const filter: PostFilter = $target.data("filter");
            filter.setEnabled(enabled);
            $target.attr("enabled", enabled + "");

            BlacklistEnhancer.updateHeader();
            BlacklistEnhancer.updateToggleSwitch();

            for (const match of filter.getMatches())
                $("#entry_" + match).trigger("re621:visibility");
            BetterSearch.trigger("postcount");
        });

        // Toggle-All Switch
        // Click to disable / re-enable all filters
        const toggleContainer = $("<blacklist-toggle>")
            .appendTo(BlacklistEnhancer.$wrapper);

        BlacklistEnhancer.$toggle = $("<a>")
            .attr("id", "disable-all-blacklists")
            .html("Disable All Filters")
            .appendTo(toggleContainer)
            .on("click.re621", () => {
                // This is dumb, but much faster than the alternative
                if (BlacklistEnhancer.$toggle.attr("id") == "re-enable-all-blacklists") {
                    Blacklist.enableAll();
                    BlacklistEnhancer.$toggle.attr("id", "disable-all-blacklists");

                    Post.find("all").each(post => post.updateVisibility());
                } else {
                    Blacklist.disableAll();
                    Post.find("blacklisted").each(post => post.updateVisibility());
                    BlacklistEnhancer.$toggle.attr("id", "re-enable-all-blacklists");

                    BlacklistEnhancer.$wrapper.attr("collapsed", "false");
                    Util.LS.setItem("bc", "0");
                    $("#sidebar").trigger("re621:reflow");
                }

                BlacklistEnhancer.update();
                BetterSearch.trigger("postcount");
            });
    }

    /** Reloads all sidebar DOM elements */
    public static update(): void {
        BlacklistEnhancer.updateFilterList();
        BlacklistEnhancer.updateHeader();
        BlacklistEnhancer.updateToggleSwitch();
        $("#sidebar").trigger("re621:reflow");
    }

    /** Reloads the blacklist header */
    public static updateHeader(): void {

        let filteredPosts = new Set<number>(),
            unfilteredPosts = new Set<number>();

        // "active" does not mean what you think it means
        for (const filter of Blacklist.getActiveFilters().values()) {
            if (filter.isEnabled()) filteredPosts = new Set([...filteredPosts, ...filter.getMatches()]);
            else unfilteredPosts = new Set([...unfilteredPosts, ...filter.getMatches()]);
        }

        BlacklistEnhancer.$header.html(`Blacklisted (${filteredPosts.size})`);
        BlacklistEnhancer.$wrapper.attr({
            "count": filteredPosts.size,
            "discount": unfilteredPosts.size,
        });
    }

    /** Reloads the blacklist filters */
    public static updateFilterList(): void {

        BlacklistEnhancer.$content.html("");

        for (const [tags, filter] of Blacklist.getActiveFilters()) {
            const count = filter.getMatchesCount();
            const entry = $("<filter>")
                .attr({
                    "count": count,
                    "enabled": filter.isEnabled()
                })
                .data("filter", filter)
                .appendTo(BlacklistEnhancer.$content)
                .on("click", function (e) {
                    if (e.target != this) return;
                    $(e.target).find("a:first")[0].click();
                });
            $("<a>")
                .attr("href", "/posts?tags=" + tags.replace(" ", "+"))
                .html(tags.replace(/_/g, "&#8203;_").replace(/ -/, " &#8209;"))
                .appendTo(entry);

            $("<span>")
                .html(count + "")
                .appendTo(entry);
        }

        $("#sidebar").trigger("re621:reflow");
    }

    /** Reloads the "Enable / Disable All" toggle */
    public static updateToggleSwitch(): void {
        // This fixes a really dumb bug.
        // If there are no blacklisted posts on the page, the blacklist would just... turn back on.
        // Not the ideal solution, but that will have to wait until the blacklist rework.
        if(BlacklistEnhancer.$wrapper.attr("count") == "0" && BlacklistEnhancer.$wrapper.attr("discount") == "0")
            return;
        
        if (BlacklistEnhancer.$content.find("filter[enabled=false]").length > 0) {
            BlacklistEnhancer.$toggle
                .html("Enable All Filters")
                .attr("id", "re-enable-all-blacklists");
            Util.LS.setItem("dab", "1");
        } else {
            BlacklistEnhancer.$toggle
                .html("Disable All Filters")
                .attr("id", "disable-all-blacklists");
            Util.LS.setItem("dab", "0");
        }
    }

}
