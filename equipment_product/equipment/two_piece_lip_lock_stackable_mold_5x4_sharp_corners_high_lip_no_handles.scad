
/*
COMPLETE TWO-PIECE HARDWARE-FREE STACKABLE SNACK BAR MOLD - 5 x 4 / 20 CAVITIES
Open-bottom frame + removable base plate with raised perimeter locating lip.
Revision: locating lip height increased for better retention / reduced tendency of the top mold to shift under light force.
Revision: side pull handles/tabs removed from the removable base plate.

REVISED 5 x 4 GRID / 20-CAVITY VERSION:
- Same basic two-piece stackable mold design as the 15-cavity version.
- Grid changed to 5 columns x 4 rows = 20 cavities.
- Overall tray width increases to fit the extra row; tray length remains the same.

REVISED CHOCOLATE-BAR CAVITY REVISION - TRUE FULL-DEPTH INCLINE, SHARP CAVITY CORNERS:
- Fixes the earlier issue where a 3 mm vertical bottom lip made the side wall
  become straight/vertical again near the base.
- The side-wall incline now runs continuously from the bottom/base plane
  all the way to the top opening.
- No vertical lower band and no secondary top taper/flare.
- Cavity top/opening remains approx. 3.15 in x 1.57 in, matching the product listing.
- Draft angle is set to 25 degrees from vertical.
- With 0.59 in depth, this gives an estimated bottom flat size of about
  66.0 mm x 25.9 mm, creating the slanted chocolate-bar style side walls.
- Cavity corner radii are removed: cavity corners are sharp (radius = 0) at both the
  bottom flat and top opening, giving a more crisp-edged bar shape.
- Raised support pads on the removable base are disabled so they do not imprint
  or add a step to the bottom of the bar.
- Low top stacking rails remain 6 mm high.
- Matching shallow grooves/recesses are added to the BOTTOM of the base plate.
- When trays are stacked, the bottom grooves of the upper tray sit over the top rails of the lower tray.
- This helps the stacked trays locate/lock together and reduces sliding.

NO:
- magnets
- clips
- screws
- sliding grooves for demolding
- compression lid
- alignment pins
- side pull handles / pull tabs

PARTS:
part_to_show = "frame";  // open-bottom mold frame with low top stacking rails
part_to_show = "base";   // removable base with locating lip and underside grooves
part_to_show = "both";   // both parts side by side

Units: millimeters
*/

$fn = 64;
part_to_show = "both";   // "frame", "base", or "both"

inch = 25.4;

// ----------------------
// Bar/cavity dimensions
// ----------------------
// The Amazon-style cavity dimensions are treated as the TOP/OPENING size.
// The bottom flat size is calculated from the draft angle and cavity depth.
cavity_l_top_target = 3.15 * inch;  // 80.01 mm top/opening length
cavity_w_top_target = 1.57 * inch;  // 39.88 mm top/opening width
cavity_depth        = 0.59 * inch;  // 14.99 mm depth

rows = 4;    // 4 rows
cols = 5;    // 5 columns = 20 cavities total

// ----------------------
// Cavity/frame settings
// ----------------------
// Estimated chocolate-bar mold inclination: about 25 degrees from vertical
// Equivalent to about 65 degrees from the bottom/base plane.
draft_angle = 25;
// No extra top-lip flare: side wall is one continuous incline to the top opening.
top_lip_soften = 0;

// Horizontal offset per side caused by the draft angle.
draft_offset = cavity_depth * tan(draft_angle);

// Bottom flat dimensions produced by this draft.
// At 25 deg and 0.59 in depth: approx. 66.0 mm x 25.9 mm.
cavity_l_bottom = cavity_l_top_target - 2*draft_offset;
cavity_w_bottom = cavity_w_top_target - 2*draft_offset;

// IMPORTANT: The bar side profile is now:
// base plane -> continuous 25 degree incline -> top opening.
// There is no intentional vertical band at the bottom.

// Cavity corners are intentionally sharp.
corner_r_bottom = 0;

wall = 6;
side_clearance = 25.4;     // 1 inch extra space along long sides
end_border = 24;
frame_bottom_lip = 0;      // TRUE full-depth incline: no vertical lower lip around cavity
outer_corner_r = 8;

// LOW top stacking rails on frame
stack_rail_h = 6;          // low height above cavity rim
stack_rail_w = 9;          // rail width
stack_rail_r = 4;
stack_rail_x_inset = 24;   // inset from short ends
stack_rail_segment_gap = 12;

// Base plate with perimeter locating lip
base_t = 4.5;              // slightly thicker to allow underside grooves
base_extra_margin = 7;     // base extends beyond frame
locating_lip_h = 4.0;      // increased lip height for better mold retention
locating_lip_w = 4.0;      // width of lip
fit_clearance = 0.8;       // clearance around frame inside lip
base_corner_r = 10;

// Underside grooves that locate onto lower tray's top rails
groove_depth = 2.0;        // must be less than base_t
groove_extra_width = 2.0;  // rail width + this clearance
groove_extra_length = 4.0; // rail segment length + this clearance
groove_r = 4;

// Optional shallow pads under cavities for cleaner bar bottoms
pad_h = 0;          // disabled: raised pads can imprint/step the bottom of the bar
pad_clearance = 0.8;

// Side pull handles/tabs removed from design.
pull_tab_l = 0;
pull_tab_w = 0;
pull_tab_r = 0;

// ----------------------
// Calculations
// ----------------------
cavity_l_top = cavity_l_top_target;
cavity_w_top = cavity_w_top_target;
// Keep cavity corners sharp all the way to the top opening.
corner_r_top = 0;

// Top opening is the final opening: no extra top flare/opening enlargement.
cavity_l_open = cavity_l_top;
cavity_w_open = cavity_w_top;
corner_r_open = corner_r_top;

cavity_field_l = cols*cavity_l_top + (cols-1)*wall;
cavity_field_w = rows*cavity_w_top + (rows-1)*wall;

tray_l = cavity_field_l + 2*end_border;
tray_w = cavity_field_w + 2*side_clearance;

frame_h = frame_bottom_lip + cavity_depth;
frame_total_h = frame_h + stack_rail_h;

base_l = tray_l + 2*base_extra_margin;
base_w = tray_w + 2*base_extra_margin;

lip_inner_l = tray_l + 2*fit_clearance;
lip_inner_w = tray_w + 2*fit_clearance;
lip_outer_l = lip_inner_l + 2*locating_lip_w;
lip_outer_w = lip_inner_w + 2*locating_lip_w;

// Frame position relative to base if assembled
frame_on_base_x = base_extra_margin;
frame_on_base_y = base_extra_margin;

// Lip position on base
lip_x = frame_on_base_x - fit_clearance - locating_lip_w;
lip_y = frame_on_base_y - fit_clearance - locating_lip_w;

// Stacking rails: three segmented rails on each long side.
// They are located in the 1-inch side-clearance area, away from cavities.
rail_available_l = tray_l - 2*stack_rail_x_inset;
rail_segment_l = (rail_available_l - 2*stack_rail_segment_gap) / 3;

// Groove positions on base underside must match top rails when trays are stacked.
// Since frame sits on base with base_extra_margin offset, rail positions on the base are frame rail positions + frame_on_base offset.
groove_l = rail_segment_l + groove_extra_length;
groove_w = stack_rail_w + groove_extra_width;

// ----------------------
// Helpers
// ----------------------
module rounded_rect_2d(l, w, r) {
    r2 = min(r, l/2 - 0.01, w/2 - 0.01);
    if (r2 <= 0) {
        square([l, w]);
    } else {
        hull() {
            translate([r2, r2]) circle(r=r2);
            translate([l-r2, r2]) circle(r=r2);
            translate([l-r2, w-r2]) circle(r=r2);
            translate([r2, w-r2]) circle(r=r2);
        }
    }
}

module rounded_box(l, w, h, r) {
    linear_extrude(height=h)
        rounded_rect_2d(l, w, r);
}

module cavity_cutter() {
    // TRUE full-depth tapered cutter.
    // Actual cavity zone, z = 0 to cavity_depth: one continuous incline.
    // Tiny extensions below and above the frame avoid coplanar CGAL artifacts,
    // but they are outside the molded bar zone and do not create vertical bands.
    union() {
        // through-cut below the frame bottom, using the bottom-flat size only
        translate([0,0,-0.6])
            linear_extrude(height=0.61)
                rounded_rect_2d(cavity_l_bottom, cavity_w_bottom, corner_r_bottom);

        // the real molded cavity surface: bottom flat to top opening
        hull() {
            translate([0,0,0])
                linear_extrude(height=0.01)
                    rounded_rect_2d(cavity_l_bottom, cavity_w_bottom, corner_r_bottom);

            translate([-draft_offset, -draft_offset, cavity_depth])
                linear_extrude(height=0.01)
                    rounded_rect_2d(cavity_l_top, cavity_w_top, corner_r_top);
        }

        // through-cut above the frame top, using the top-opening size only
        translate([-draft_offset, -draft_offset, cavity_depth])
            linear_extrude(height=0.6)
                rounded_rect_2d(cavity_l_top, cavity_w_top, corner_r_top);
    }
}

module top_stacking_rails() {
    for (s = [0:2]) {
        x = stack_rail_x_inset + s*(rail_segment_l + stack_rail_segment_gap);

        // lower long-side rail
        translate([x, 3, frame_h])
            rounded_box(rail_segment_l, stack_rail_w, stack_rail_h, stack_rail_r);

        // upper long-side rail
        translate([x, tray_w - stack_rail_w - 3, frame_h])
            rounded_box(rail_segment_l, stack_rail_w, stack_rail_h, stack_rail_r);
    }
}

module underside_groove_cutters() {
    for (s = [0:2]) {
        x = frame_on_base_x + stack_rail_x_inset + s*(rail_segment_l + stack_rail_segment_gap) - groove_extra_length/2;

        // groove matching lower-side rail
        y1 = frame_on_base_y + 3 - groove_extra_width/2;
        translate([x, y1, -0.1])
            rounded_box(groove_l, groove_w, groove_depth + 0.2, groove_r);

        // groove matching upper-side rail
        y2 = frame_on_base_y + tray_w - stack_rail_w - 3 - groove_extra_width/2;
        translate([x, y2, -0.1])
            rounded_box(groove_l, groove_w, groove_depth + 0.2, groove_r);
    }
}

// ----------------------
// Part 1: Open-bottom frame with LOW top stacking rails
// ----------------------
module open_bottom_frame_with_low_rails() {
    difference() {
        union() {
            rounded_box(tray_l, tray_w, frame_h, outer_corner_r);
            top_stacking_rails();
        }

        // cut open-bottom cavities
        for (r = [0:rows-1]) {
            for (c = [0:cols-1]) {
                x = end_border + c*(cavity_l_top + wall) + draft_offset;
                y = side_clearance + r*(cavity_w_top + wall) + draft_offset;

                // full-depth tapered cavity; no separate vertical bottom through-opening
                translate([x, y, 0])
                    cavity_cutter();
            }
        }
    }
}

// ----------------------
// Part 2: Removable base plate with locating lip and underside grooves
// ----------------------
module base_plate_with_locating_lip_and_bottom_grooves() {
    difference() {
        union() {
            // main base plate
            rounded_box(base_l, base_w, base_t, base_corner_r);

            // perimeter locating lip: outer rounded rectangle minus inner opening
            translate([lip_x, lip_y, base_t])
                difference() {
                    rounded_box(lip_outer_l, lip_outer_w, locating_lip_h, base_corner_r);
                    translate([locating_lip_w, locating_lip_w, -0.1])
                        rounded_box(lip_inner_l, lip_inner_w, locating_lip_h + 0.2, outer_corner_r + fit_clearance);
                }

            // optional shallow raised support pads under each cavity
            // Disabled by default because pads can leave a step/imprint on the bar bottom.
            if (pad_h > 0) {
                for (r = [0:rows-1]) {
                    for (c = [0:cols-1]) {
                        x = frame_on_base_x + end_border + c*(cavity_l_top + wall) + draft_offset + pad_clearance/2;
                        y = frame_on_base_y + side_clearance + r*(cavity_w_top + wall) + draft_offset + pad_clearance/2;
                        translate([x, y, base_t])
                            rounded_box(cavity_l_bottom - pad_clearance,
                                        cavity_w_bottom - pad_clearance,
                                        pad_h,
                                        corner_r_bottom - 0.5);
                    }
                }
            }

            // side pull handles/tabs removed by request
        }

        // underside rail-matching grooves
        underside_groove_cutters();
    }
}

// ----------------------
// Render selection
// ----------------------
if (part_to_show == "frame") {
    open_bottom_frame_with_low_rails();
}
else if (part_to_show == "base") {
    base_plate_with_locating_lip_and_bottom_grooves();
}
else {
    open_bottom_frame_with_low_rails();
    translate([0, tray_w + 80, 0])
        base_plate_with_locating_lip_and_bottom_grooves();
}
