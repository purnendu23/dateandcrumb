
$fn = 64;
part_to_show = "both";   // "frame", "base", or "both"

inch = 25.4;

// Bar/cavity dimensions
cavity_l_bottom = 3.15 * inch;
cavity_w_bottom = 1.57 * inch;
cavity_depth    = 0.59 * inch;

rows = 3;
cols = 3;

// Settings
draft_angle = 3;
corner_r_bottom = 4;
top_lip_soften = 1.2;

wall = 6;
side_clearance = 25.4;
end_border = 24;
frame_bottom_lip = 3;
outer_corner_r = 8;

stack_rail_h = 6;
stack_rail_w = 9;
stack_rail_r = 4;
stack_rail_x_inset = 24;
stack_rail_segment_gap = 10;

base_t = 4.5;
base_extra_margin = 7;
locating_lip_h = 2.5;
locating_lip_w = 4.0;
fit_clearance = 0.8;
base_corner_r = 10;

groove_depth = 2.0;
groove_extra_width = 2.0;
groove_extra_length = 4.0;
groove_r = 4;

pad_h = 0.8;
pad_clearance = 0.8;

pull_tab_l = 20;
pull_tab_w = 55;
pull_tab_r = 8;

// Calculations
draft_offset = cavity_depth * tan(draft_angle);

cavity_l_top = cavity_l_bottom + 2*draft_offset;
cavity_w_top = cavity_w_bottom + 2*draft_offset;
corner_r_top = corner_r_bottom + draft_offset;

cavity_l_open = cavity_l_top + 2*top_lip_soften;
cavity_w_open = cavity_w_top + 2*top_lip_soften;
corner_r_open = corner_r_top + top_lip_soften;

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

frame_on_base_x = base_extra_margin;
frame_on_base_y = base_extra_margin;

lip_x = frame_on_base_x - fit_clearance - locating_lip_w;
lip_y = frame_on_base_y - fit_clearance - locating_lip_w;

rail_segments = 2;
rail_available_l = tray_l - 2*stack_rail_x_inset;
rail_segment_l = (rail_available_l - (rail_segments-1)*stack_rail_segment_gap) / rail_segments;

groove_l = rail_segment_l + groove_extra_length;
groove_w = stack_rail_w + groove_extra_width;

// Helpers
module rounded_rect_2d(l, w, r) {
    r2 = min(r, l/2 - 0.01, w/2 - 0.01);
    hull() {
        translate([r2, r2]) circle(r=r2);
        translate([l-r2, r2]) circle(r=r2);
        translate([l-r2, w-r2]) circle(r=r2);
        translate([r2, w-r2]) circle(r=r2);
    }
}

module rounded_box(l, w, h, r) {
    linear_extrude(height=h)
        rounded_rect_2d(l, w, r);
}

module cavity_cutter() {
    hull() {
        translate([0,0,0])
            linear_extrude(height=0.1)
                rounded_rect_2d(cavity_l_bottom, cavity_w_bottom, corner_r_bottom);

        translate([-draft_offset, -draft_offset, cavity_depth - top_lip_soften])
            linear_extrude(height=0.1)
                rounded_rect_2d(cavity_l_top, cavity_w_top, corner_r_top);
    }

    hull() {
        translate([-draft_offset, -draft_offset, cavity_depth - top_lip_soften])
            linear_extrude(height=0.1)
                rounded_rect_2d(cavity_l_top, cavity_w_top, corner_r_top);

        translate([-(draft_offset + top_lip_soften), -(draft_offset + top_lip_soften), cavity_depth])
            linear_extrude(height=0.1)
                rounded_rect_2d(cavity_l_open, cavity_w_open, corner_r_open);
    }
}

module top_stacking_rails() {
    for (s = [0:rail_segments-1]) {
        x = stack_rail_x_inset + s*(rail_segment_l + stack_rail_segment_gap);

        translate([x, 3, frame_h])
            rounded_box(rail_segment_l, stack_rail_w, stack_rail_h, stack_rail_r);

        translate([x, tray_w - stack_rail_w - 3, frame_h])
            rounded_box(rail_segment_l, stack_rail_w, stack_rail_h, stack_rail_r);
    }
}

module underside_groove_cutters() {
    for (s = [0:rail_segments-1]) {
        x = frame_on_base_x + stack_rail_x_inset + s*(rail_segment_l + stack_rail_segment_gap) - groove_extra_length/2;

        y1 = frame_on_base_y + 3 - groove_extra_width/2;
        translate([x, y1, -0.1])
            rounded_box(groove_l, groove_w, groove_depth + 0.2, groove_r);

        y2 = frame_on_base_y + tray_w - stack_rail_w - 3 - groove_extra_width/2;
        translate([x, y2, -0.1])
            rounded_box(groove_l, groove_w, groove_depth + 0.2, groove_r);
    }
}

module snack_bar_frame_3x3() {
    difference() {
        union() {
            rounded_box(tray_l, tray_w, frame_h, outer_corner_r);
            top_stacking_rails();
        }

        for (r = [0:rows-1]) {
            for (c = [0:cols-1]) {
                x = end_border + c*(cavity_l_top + wall) + draft_offset;
                y = side_clearance + r*(cavity_w_top + wall) + draft_offset;

                translate([x-0.25, y-0.25, -0.5])
                    linear_extrude(height=frame_bottom_lip+1)
                        rounded_rect_2d(cavity_l_bottom+0.5, cavity_w_bottom+0.5, corner_r_bottom);

                translate([x, y, frame_bottom_lip])
                    cavity_cutter();
            }
        }
    }
}

module snack_bar_base_3x3() {
    difference() {
        union() {
            rounded_box(base_l, base_w, base_t, base_corner_r);

            translate([lip_x, lip_y, base_t])
                difference() {
                    rounded_box(lip_outer_l, lip_outer_w, locating_lip_h, base_corner_r);
                    translate([locating_lip_w, locating_lip_w, -0.1])
                        rounded_box(lip_inner_l, lip_inner_w, locating_lip_h + 0.2, outer_corner_r + fit_clearance);
                }

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

            translate([-pull_tab_l, base_w/2 - pull_tab_w/2, 0])
                rounded_box(pull_tab_l, pull_tab_w, base_t, pull_tab_r);

            translate([base_l, base_w/2 - pull_tab_w/2, 0])
                rounded_box(pull_tab_l, pull_tab_w, base_t, pull_tab_r);
        }

        underside_groove_cutters();
    }
}

if (part_to_show == "frame") {
    snack_bar_frame_3x3();
}
else if (part_to_show == "base") {
    snack_bar_base_3x3();
}
else {
    snack_bar_frame_3x3();
    translate([0, tray_w + 80, 0])
        snack_bar_base_3x3();
}
