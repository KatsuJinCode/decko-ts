# F4 must change an existing coded image

The widget check required a colon-bearing form control, never submitted an
image, and concluded that changing a coded image was impossible. It also had
an unreachable undefined `codedServed` reference. The content-flow check created
a new ordinary upload, read the wrong subcard storage, and labeled that as a
coded-image operation. Neither observed the stated action.

Installed stock `card-mod-carrierwave-0.20.0/set/abstract/attachment/coded.rb`
defines `uncode_attachment_storage`: an ordinary update to a coded attachment
switches to configured storage unless explicit coded storage/mod was requested.
The card mount then handles the uploaded file. Shipped mod bytes are not edited.
The search gateway did not find a versioned Cypress replacement test; the
installed source and actual served form decide the behavior here.

A private actual browser probe on full Bunny bundle
`896cb250de6e410e2b4ea06086b7b2aae546dfa04b9a39989a78bf3b7b5ae18c`
changes existing Decko logo `:decko_logo/carrierwave.svg` to `~49302/2.png`
through the real upload input and Save and Close button. Original upload bytes
match the existing gradient.png fixture, the served image decodes at 24x16,
the codename remains, and the shipped asset source stays unchanged. Unknown
coded identifiers remain 404. Cleanup through the named card's update route
restores its original coded content and exact original served SVG bytes.

Both original check names now use one shared native replacement helper. It
waits for the real cached-upload draft, checks stored state and served bytes,
and restores the existing fixture in finally before later checks continue.
No runtime change or weakened production permission is needed.

Earlier probe receipts are retained: the first wrongly required the old coded
URL to remain addressable after un-coding, and another used /card/update
without a target mark during cleanup (404). The successful corrected receipt is
the process repository's private-probes/coded-image-native-r4-2026-10-18T04-17-56-116Z/.
These diagnostics do not update the frozen 206/223 score. A clean selected
capture of both corrected first-party checks follows this instrument commit.
