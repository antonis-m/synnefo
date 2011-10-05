;(function(root){

    // root
    var root = root;
    
    // setup namepsaces
    var snf = root.synnefo = root.synnefo || {};
    var models = snf.models = snf.models || {}
    var storage = snf.storage = snf.storage || {};
    var ui = snf.ui = snf.ui || {};
    var util = snf.util = snf.util || {};

    var views = snf.views = snf.views || {}

    // shortcuts
    var bb = root.Backbone;
    
    views.SingleDetailsView = views.VMDetailsView.extend({
    
        view_id: "vm_details_single",
        el_sel: '.machine-details',
        
        selectors: {
            'cpu': '.machine-detail.cpus',
            'ram': '.machine-detail.ram',
            'disk': '.machine-detail.disk',
            'image_name': '.machine-detail.image-name',
            'image_size': '.machine-detail.image-size'
        }
    
    })

    // VMs single view
    views.SingleView = views.VMListView.extend({
        
        // view id (this could be used to identify 
        // the view object from global context
        view_id: 'vm_single',

        el: '#machinesview-single',
        id_tpl: 'single-vm-',
        link_id_tpl: 'single-vm-at-',

        hide_actions: false,

        selectors: {
            'vms': '.single-container',
            'vm': 'div#single-vm-',
            'view': '#machinesview-single',
            'tpl': 'div.single-container#machine-container-template',
            'spinner': '.large-spinner',
            'vm_spinner': 'div.single-container#single-vm-{0} .state .spinner',
            'vm_wave': 'div.single-container#single-vm-{0} img.wave',
            'vm_cont_active': '#machinesview-single',
            'vm_cont_terminated': '#machinesview-single'
        },
        
        initialize: function() {
            this.current_vm = 0;
            
            // button selectors
            this.prev_button = this.$(".controls .previous");
            this.next_button = this.$(".controls .next");
            this.menu = $("#single-servers-list");

            views.SingleView.__super__.initialize.apply(this, arguments);
            this.update_current_vm();
        },

        // overload show function
        show: function() {
            views.SingleView.__super__.show.apply(this, arguments);
            this.log.debug("showing");
            this.$(".column3").show();
            this.show_vm_menu();
            this.show_current();
        },

        show_vm: function(vm) {
            console.log("SHOW", vm.id);
            this.current_vm_instance = vm;
            this.show_vm_menu();
            this.show_current();
            this.update_layout();
        },

        // identify vm model instance id based on DOM element
        vm_id_for_element: function(el) {
            return el.attr('id').replace("single-vm-", "");
        },
        
        // set generic view handlers
        set_handlers: function() {
            this.prev_button.click(_.bind(function(ev){
                storage.vms.reset_pending_actions();
                ev.preventDefault();
                this.show_prev();
            }, this));

            this.next_button.click(_.bind(function(ev){
                storage.vms.reset_pending_actions();
                ev.preventDefault();
                this.show_next();
            }, this));
        },  

        update_current_vm: function() {
            try {
                this.current_vm_instance = storage.vms.at(this.current_vm);
                this.current_vm_instance.start_stats_update(true);
                storage.vms.stop_stats_update([this.current_vm_instance]);
            } catch (err) {
                this.log.debug("Cannot select current vm instance for: {0}".format(this.current_vm));
                this.current_vm_instance = undefined;
                this.current_vm = 0;
            }
        },

        show_next: function() {
            this.current_vm++;
            if (this.current_vm >= storage.vms.models.length) {
                this.current_vm = 0;
            }

            this.update_current_vm();
            this.show_current();
            this.__update_layout();
        },

        show_prev: function() {
            this.current_vm--;
            if (this.current_vm < 0) {
                this.current_vm = storage.vms.length - 1;
            }
            this.update_current_vm();
            this.show_current();
            this.__update_layout();
        },

        post_remove_vm: function(vm) {
            // current vm removed or does not exist after an update
            this.show_vm_menu();
            if (!this.current_vm_instance || this.current_vm_instance.id == vm.id) {
                this.show_next();
            } else {
                this.show_current();
            }
        },
        
        // stuff to do when a new vm has been created.
        // - create vm subviews
        post_add: function(vm) {
            this.show_vm_menu();
            this.show_current();

            // rename views index
            this.stats_views = this.stats_views || {};
            this.connect_views = this.connect_views || {};
            this.tags_views = this.tags_views || {};
            this.details_views = this.details_views || {};
            this.action_views = this.action_views || {};
            this.action_error_views = this.action_error_views || {};

            //this.stats_views[vm.id] = new views.IconStatsView(vm, this);

            // same as icon view
            this.action_views[vm.id] = new views.VMActionsView(vm, this, this.vm(vm), this.hide_actions);
            this.stats_views[vm.id] = new views.VMStatsView(vm, this, {stats_type: 'series'});
            this.connect_views[vm.id] = new views.IconVMConnectView(vm, this);
            this.tags_views[vm.id] = new views.VMTagsView(vm, this, true, 20, 10, 35);
            this.details_views[vm.id] = new views.SingleDetailsView(vm, this);
            this.action_error_views[vm.id] = new views.VMActionErrorView(vm, this);
            
            if (storage.vms.models.length > 1) { this.vm(vm).hide(); };
        },

        post_update_vm: function(vm) {
        },
        
        // vm specific event handlers
        set_vm_handlers: function(vm) {
            var el = this.vm(vm);
        },
        
        // handle selected vm
        show_current: function() {
            var index = this.current_vm;
            var vm = storage.vms.at(index);

            this.$(".server-name").removeClass("column3-selected");
            
            if (vm) {
                this.vm(vm).show();
            };

            _.each(storage.vms.models, function(vmo){
                if (vm && (vm.id != vmo.id)) {
                    this.vm(vmo).hide();
                }
            }, this)

            if (!vm) {
                // empty list
                this.$(".column3").hide();
                return;
            }
            this.$(".column3").show();


            $("#" + this.link_id_tpl + this.current_vm).addClass("column3-selected");
            try {
                this.update_details(vm);
            } catch (err) {};
        },

        show_vm_menu: function() {
            this.menu.find(".server-name").remove();

            _.each(storage.vms.models, function(vm, index) {
                this.menu.append('<div class="server-name" id="'+this.link_id_tpl + index +'">' + 
                               util.truncate(vm.get("name"),16)+'</div>');
                if (this.current_vm_instance && vm.id == this.current_vm_instance.id) {
                    this.current_vm = index;
                }
            }, this);
            
            var self = this;
            this.menu.find(".server-name").click(function(ev) {
                ev.preventDefault();
                var id = $(this).attr("id").replace("single-vm-at-", "");
                self.current_vm = id;
                self.update_current_vm();
                self.show_current();
            })
        },

        // generic stuff to do on each view update
        // called once after each vm has been updated
        update_layout: function() {
            this.update_current_vm();
            fix_v6_addresses();
        },

        // update vm details
        update_details: function(vm) {
            var el = this.vm(vm);
            if (vm != this.current_vm_instance) { return };

            // truncate name
            el.find(".machine-detail.name").text(util.truncate(vm.get("name"), 35));
            // set ips
            el.find(".machine-detail.ipv4.ipv4-text").text(vm.get_addresses().ip4 || "not set");
            // TODO: fix ipv6 truncates and tooltip handler
            el.find(".machine-detail.ipv6.ipv6-text").text(vm.get_addresses().ip6 || "not set");
            // set the state (i18n ??)
            el.find(".state-label").text(STATE_TEXTS[vm.state()]);
            // set state class
            el.find(".state").removeClass().addClass(views.SingleView.STATE_CLASSES[vm.state()].join(" "));
            // os icon
            el.find(".single-image").css({'background-image': "url(" + this.get_vm_icon_path(vm, "medium") + ")"});
            
            el.removeClass("connectable");
            if (vm.is_connectable()) {
                el.addClass("connectable");
            }

            if (vm.get('status') == 'BUILD') {
                // update bulding progress
                el.find("span.build-progress").show().text(vm.get("progress_message"));
            } else {
                // hide building progress
                el.find("span.build-progress").hide();
            }

            if (vm.state() == "DESTROY") {
                el.find("span.build-progress").show().text("Terminating...");
            }

            icon_state = vm.is_active() ? "on" : "off";
            set_machine_os_image(el, "single", icon_state, this.get_vm_icon_os(vm));
            
            // update subviews
            this.action_views[vm.id].update_layout();
            this.stats_views[vm.id].update_layout();
            this.connect_views[vm.id].update_layout();
            this.tags_views[vm.id].update_layout();
            this.details_views[vm.id].update_layout();
        },
            
        get_vm_icon_os: function(vm) {
            var os = vm.get_os();
            var icons = window.os_icons || views.SingleView.VM_OS_ICONS;
            if (icons.indexOf(os) == -1) {
                os = "unknown";
            }
            return os;
        },

        // TODO: move to views.utils (the method and the VM_OS_ICON vars)
        get_vm_icon_path: function(vm, icon_type) {
            var os = vm.get_os();
            var icons = window.os_icons || views.SingleView.VM_OS_ICONS;

            if (icons.indexOf(os) == -1) {
                os = "unknown";
            }

            return views.SingleView.VM_OS_ICON_TPLS[icon_type].format(os);
        }
    })

    views.SingleView.VM_OS_ICON_TPLS = {
        "medium": "/static/icons/machines/large/{0}-sprite.png"
    }

    views.SingleView.VM_OS_ICONS = window.os_icons || [];

    views.SingleView.STATE_CLASSES = {
        'UNKNOWN':          ['state', 'error-state'],
        'BUILD':            ['state', 'build-state'],
        'REBOOT':           ['state', 'rebooting-state'],
        'STOPPED':          ['state', 'terminated-state'],
        'ACTIVE':           ['state', 'running-state'],
        'ERROR':            ['state', 'error-state'],
        'DELETED':           ['state', 'destroying-state'],
        'DESTROY':          ['state', 'destroying-state'],
        'BUILD_INIT':       ['state', 'build-state'], 
        'BUILD_COPY':       ['state', 'build-state'],
        'BUILD_FINAL':      ['state', 'build-state'],
        'SHUTDOWN':         ['state', 'shutting-state'],
        'START':            ['state', 'starting-state'],
        'CONNECT':          ['state', 'connecting-state'],
        'DISCONNECT':       ['state', 'disconnecting-state']
    };

})(this);
