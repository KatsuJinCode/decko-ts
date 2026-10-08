# frozen_string_literal: true

# A Capybara driver that drives a hidden browser already installed on the
# machine, through playwright-core (bridge.mjs). It needs no WebDriver binary:
# the bridge talks to Chrome, Edge or Chromium over the DevTools protocol.
#
# Register it with `require_relative "register"` (see register.rb), which
# also makes it Capybara's JavaScript driver.
#
# Environment: HARNESS_NODE (node executable, default "node"), plus the
# bridge's HARNESS_PLAYWRIGHT_CORE and HARNESS_CHROME (see ../lib/launch.mjs).

require "capybara"
require "json"
require "open3"

module Capybara
  module Playwright
    class StaleElementError < StandardError; end
    class NoSuchWindowError < StandardError; end
    class BridgeError < StandardError; end

    # The Node process holding the browser.
    class Bridge
      BRIDGE = File.expand_path("bridge.mjs", __dir__)

      def initialize
        node = ENV.fetch("HARNESS_NODE", "node")
        @stdin, @stdout, @stderr, @wait = Open3.popen3(node, BRIDGE)
        @stderr_thread = Thread.new { @stderr.each_line { |l| warn "[browser] #{l}" if ENV["HARNESS_BROWSER_DEBUG"] } }
        @seq = 0
        @mutex = Mutex.new
        line = read_protocol_line
        raise BridgeError, "browser bridge did not start" unless line && JSON.parse(line)["ready"]

        at_exit { quit }
      end

      def call(cmd, **args)
        @mutex.synchronize do
          id = (@seq += 1)
          @stdin.puts JSON.generate(args.merge(id: id, cmd: cmd))
          @stdin.flush
          loop do
            line = read_protocol_line
            raise BridgeError, "browser bridge exited" unless line

            msg = JSON.parse(line)
            next unless msg["id"] == id
            return msg["result"] if msg["ok"]

            raise error_for(msg["error"])
          end
        end
      end

      def quit
        return if @quit

        @quit = true
        begin
          call(:quit)
        rescue StandardError
          nil
        end
        [@stdin, @stdout].each { |io| io.close unless io.closed? }
        @wait&.join(10)
      end

      private

      def read_protocol_line
        while (line = @stdout.gets)
          return line if line.start_with?("{")
        end
        nil
      end

      def error_for(err)
        case err["class"]
        when "StaleElement" then StaleElementError.new(err["message"])
        when "NoSuchWindow" then NoSuchWindowError.new(err["message"])
        else BridgeError.new("#{err['class']}: #{err['message']}")
        end
      end
    end

    # Selenium-shaped window switching, for steps that reach for
    # `page.driver.browser.switch_to.window(...)` and `window_handles`.
    class BrowserShim
      def initialize(driver) = @driver = driver
      def window_handles = @driver.window_handles
      def switch_to = self
      def window(handle) = @driver.switch_to_window(handle)
    end

    class Driver < Capybara::Driver::Base
      DISPLAYED_ATOM = File.read(
        File.join(Gem.loaded_specs["capybara"].full_gem_path, "lib/capybara/selenium/atoms/isDisplayed.min.js")
      )

      attr_reader :app, :options

      def initialize(app, **options)
        super()
        @app = app
        @options = options
      end

      def bridge = (@bridge ||= Bridge.new)
      def browser = (@browser ||= BrowserShim.new(self))

      def visit(url) = bridge.call(:visit, url: url)
      def refresh = bridge.call(:refresh)
      def go_back = bridge.call(:go_back)
      def go_forward = bridge.call(:go_forward)
      def current_url = bridge.call(:current_url)
      def html = bridge.call(:html)
      def title = bridge.call(:title)
      def frame_title = bridge.call(:frame_title)
      def frame_url = bridge.call(:frame_url)

      def find_xpath(query, **) = nodes(bridge.call(:find, kind: "xpath", query: query))
      def find_css(query, **) = nodes(bridge.call(:find, kind: "css", query: query))

      def execute_script(script, *args)
        bridge.call(:script, script: script, args: wrap_args(args), returns: false)
        nil
      end

      def evaluate_script(script, *args)
        unwrap(bridge.call(:script, script: script.strip, args: wrap_args(args), returns: true))
      end

      def evaluate_async_script(script, *args)
        wrapped = "new Promise(function(r){ " \
                  "(function(){ #{script} }).apply(null, #{JSON.generate(wrap_args(args))}.concat([r])); })"
        unwrap(bridge.call(:script, script: wrapped, args: [], returns: true))
      end

      def send_keys(*keys) = bridge.call(:send_keys, el: nil, keys: Node.encode_keys(keys))
      def active_element = unwrap(bridge.call(:active_element))
      def save_screenshot(path, **) = bridge.call(:screenshot, path: path.to_s)

      def switch_to_frame(frame)
        case frame
        when :top then bridge.call(:switch_frame, to: "top")
        when :parent then bridge.call(:switch_frame, to: "parent")
        else bridge.call(:switch_frame, to: "element", el: frame.native.id)
        end
      end

      def current_window_handle = bridge.call(:current_window_handle)
      def window_handles = bridge.call(:window_handles)
      def open_new_window(_kind = :tab) = bridge.call(:open_window)
      def switch_to_window(handle) = bridge.call(:switch_window, handle: handle)
      def close_window(handle) = bridge.call(:close_window, handle: handle)
      def window_size(handle) = bridge.call(:window_size, handle: handle)
      def resize_window_to(handle, width, height) = bridge.call(:resize_window, handle: handle, width: width, height: height)
      def maximize_window(handle) = resize_window_to(handle, 1600, 1200)

      def no_such_window_error = NoSuchWindowError
      def invalid_element_errors = [StaleElementError]
      def wait? = true
      def needs_server? = true

      # Native dialogs are accepted by the bridge as they appear.
      def accept_modal(_type, **_options)
        yield if block_given?
        nil
      end

      def dismiss_modal(_type, **_options)
        yield if block_given?
        nil
      end

      def reset!
        bridge.call(:reset) if @bridge
      end

      def displayed_atom = DISPLAYED_ATOM

      private

      def nodes(ids) = ids.map { |id| Node.new(self, NativeRef.new(self, id)) }

      def wrap_args(args)
        args.map do |a|
          case a
          when Capybara::Node::Element then { __el: a.base.native.id }
          when Node then { __el: a.native.id }
          when Array then wrap_args(a)
          else a
          end
        end
      end

      def unwrap(value)
        case value
        when Hash
          if value.key?("__el") then Capybara::Node::Element.new(session, Node.new(self, NativeRef.new(self, value["__el"])), nil, nil)
          elsif value.key?("__els") then value["__els"].map { |id| unwrap("__el" => id) }
          else value.transform_values { |v| unwrap(v) }
          end
        when Array then value.map { |v| unwrap(v) }
        else value
        end
      end
    end

    # What `node.native` returns: the bridge's element id, plus the one
    # Selenium-element method steps call directly (`native.send_keys`).
    class NativeRef
      attr_reader :id

      def initialize(driver, id)
        @driver = driver
        @id = id
      end

      def send_keys(*keys) = @driver.bridge.call(:send_keys, el: id, keys: Node.encode_keys(keys))
      def ==(other) = other.is_a?(NativeRef) && (other.id == id || @driver.bridge.call(:same, a: id, b: other.id))
    end

    class Node < Capybara::Driver::Node
      include Capybara::Node::WhitespaceNormalizer

      def self.encode_keys(keys)
        keys.flatten(0).map do |k|
          case k
          when Symbol then ":#{k}"
          when Array then k.map { |x| x.is_a?(Symbol) ? ":#{x}" : x.to_s }
          else k.to_s
          end
        end
      end

      def bridge = driver.bridge
      def id = native.id
      def prop(name) = bridge.call(:node, el: id, prop: name)

      def visible_text = prop("visible_text")
      def all_text = normalize_spacing(prop("all_text"))
      def [](name) = bridge.call(:attr, el: id, name: name.to_s)
      def value = prop("value")
      def style(styles) = bridge.call(:style, el: id, names: styles.map(&:to_s))

      def set(value, **_options)
        value = value.map(&:to_s) if value.is_a?(Array)
        value = value.to_s if value.is_a?(Pathname)
        bridge.call(:set, el: id, value: value)
      end

      def select_option = bridge.call(:select_option, el: id)
      def unselect_option = bridge.call(:unselect_option, el: id)

      def click(keys = [], **options)
        offset = options[:x] && options[:y] ? { x: options[:x], y: options[:y] } : nil
        bridge.call(:click, el: id, keys: self.class.encode_keys(keys), offset: offset)
      end

      def right_click(keys = [], **) = bridge.call(:right_click, el: id, keys: self.class.encode_keys(keys))
      def double_click(keys = [], **) = bridge.call(:double_click, el: id, keys: self.class.encode_keys(keys))
      def send_keys(*args) = bridge.call(:send_keys, el: id, keys: self.class.encode_keys(args))
      def hover = bridge.call(:hover, el: id)
      def trigger(event) = bridge.call(:trigger, el: id, event: event.to_s)
      def scroll_to(*) = bridge.call(:scroll_into_view, el: id)

      def tag_name = prop("tag_name")
      def visible? = bridge.call(:visible, el: id, atom: driver.displayed_atom) ? true : false
      def obscured? = bridge.call(:obscured, el: id)
      def checked? = prop("checked")
      def selected? = prop("selected")
      def disabled? = prop("disabled")
      def readonly? = prop("readonly")
      def multiple? = prop("multiple")
      def rect = prop("rect")
      def path = prop("path")

      def find_xpath(query, **) = wrap(bridge.call(:find, kind: "xpath", query: query, from: id))
      def find_css(query, **) = wrap(bridge.call(:find, kind: "css", query: query, from: id))

      def ==(other) = other.respond_to?(:native) && native == other.native

      private

      def wrap(ids) = ids.map { |i| self.class.new(driver, NativeRef.new(driver, i)) }
    end
  end
end
