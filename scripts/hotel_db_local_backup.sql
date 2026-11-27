-- Hotel Management System Database Dump
-- Generated for Local Run

CREATE DATABASE IF NOT EXISTS `hotel_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `hotel_db`;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `amenities`;
CREATE TABLE `amenities` (
  `amenity_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  PRIMARY KEY (`amenity_id`),
  UNIQUE KEY `uq_amenities_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `feedback`;
CREATE TABLE `feedback` (
  `feedback_id` int NOT NULL AUTO_INCREMENT,
  `stay_id` int NOT NULL,
  `rating` tinyint NOT NULL,
  `comments` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`feedback_id`),
  UNIQUE KEY `uq_feedback_stay` (`stay_id`),
  CONSTRAINT `fk_fb_stay` FOREIGN KEY (`stay_id`) REFERENCES `stays` (`stay_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ck_fb_rating` CHECK ((`rating` between 1 and 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `guests`;
CREATE TABLE `guests` (
  `guest_id` int NOT NULL AUTO_INCREMENT,
  `first_name` varchar(50) NOT NULL,
  `last_name` varchar(50) NOT NULL,
  `gender` enum('M','F','Other') DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `phone` varchar(20) NOT NULL,
  `nationality` varchar(50) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `city` varchar(50) DEFAULT NULL,
  `id_type` enum('CNIC','Passport','License','Other') DEFAULT NULL,
  `id_number` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`guest_id`),
  UNIQUE KEY `uq_guests_id` (`id_type`,`id_number`),
  KEY `idx_guests_email` (`email`),
  KEY `idx_guests_phone` (`phone`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `housekeeping_tasks`;
CREATE TABLE `housekeeping_tasks` (
  `task_id` int NOT NULL AUTO_INCREMENT,
  `room_id` int NOT NULL,
  `assigned_to` int DEFAULT NULL,
  `status` enum('pending','in_progress','done') NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` datetime DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`task_id`),
  KEY `fk_hk_room` (`room_id`),
  KEY `fk_hk_assigned_to` (`assigned_to`),
  KEY `idx_hk_status` (`status`),
  CONSTRAINT `fk_hk_assigned_to` FOREIGN KEY (`assigned_to`) REFERENCES `staff` (`staff_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_hk_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`room_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ck_hk_times` CHECK (((`completed_at` is null) or (`completed_at` >= `created_at`)))
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `invoice_items`;
CREATE TABLE `invoice_items` (
  `item_id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int NOT NULL,
  `item_type` enum('room','service','penalty','other') NOT NULL,
  `stay_id` int DEFAULT NULL,
  `order_id` int DEFAULT NULL,
  `description` varchar(255) NOT NULL,
  `quantity` int NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  PRIMARY KEY (`item_id`),
  UNIQUE KEY `uq_ii_stay` (`stay_id`),
  UNIQUE KEY `uq_ii_order` (`order_id`),
  KEY `fk_ii_invoice` (`invoice_id`),
  CONSTRAINT `fk_ii_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`invoice_id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_ii_order` FOREIGN KEY (`order_id`) REFERENCES `service_orders` (`order_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_ii_stay` FOREIGN KEY (`stay_id`) REFERENCES `stays` (`stay_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ck_ii_line_type` CHECK ((((`item_type` = _utf8mb4'room') and (`stay_id` is not null) and (`order_id` is null)) or ((`item_type` = _utf8mb4'service') and (`stay_id` is null) and (`order_id` is not null)) or ((`item_type` in (_utf8mb4'penalty',_utf8mb4'other')) and (`stay_id` is null) and (`order_id` is null)))),
  CONSTRAINT `ck_ii_price` CHECK ((`unit_price` >= 0)),
  CONSTRAINT `ck_ii_qty` CHECK ((`quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `invoices`;
CREATE TABLE `invoices` (
  `invoice_id` int NOT NULL AUTO_INCREMENT,
  `reservation_id` int NOT NULL,
  `issue_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `subtotal` decimal(10,2) NOT NULL,
  `tax_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `discount_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total_amount` decimal(10,2) NOT NULL,
  `status` enum('issued','paid') NOT NULL DEFAULT 'issued',
  `generated_by` int NOT NULL,
  PRIMARY KEY (`invoice_id`),
  UNIQUE KEY `uq_invoices_reservation` (`reservation_id`),
  KEY `fk_inv_generated_by` (`generated_by`),
  CONSTRAINT `fk_inv_generated_by` FOREIGN KEY (`generated_by`) REFERENCES `staff` (`staff_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_inv_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`reservation_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ck_inv_discount` CHECK ((`discount_amount` >= 0)),
  CONSTRAINT `ck_inv_subtotal` CHECK ((`subtotal` >= 0)),
  CONSTRAINT `ck_inv_tax` CHECK ((`tax_amount` >= 0)),
  CONSTRAINT `ck_inv_total` CHECK ((`total_amount` = ((`subtotal` + `tax_amount`) - `discount_amount`)))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `payments`;
CREATE TABLE `payments` (
  `payment_id` int NOT NULL AUTO_INCREMENT,
  `reservation_id` int NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `method` enum('cash','card','bank_transfer','online','cheque') NOT NULL,
  `transaction_ref` varchar(100) DEFAULT NULL,
  `processed_by` int NOT NULL,
  `paid_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  KEY `fk_pay_processed_by` (`processed_by`),
  KEY `idx_pay_res_paid` (`reservation_id`,`paid_at`),
  CONSTRAINT `fk_pay_processed_by` FOREIGN KEY (`processed_by`) REFERENCES `staff` (`staff_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_pay_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`reservation_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ck_pay_amount` CHECK ((`amount` <> 0))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `reservation_rooms`;
CREATE TABLE `reservation_rooms` (
  `reservation_room_id` int NOT NULL AUTO_INCREMENT,
  `reservation_id` int NOT NULL,
  `room_id` int NOT NULL,
  `rate_per_night` decimal(10,2) NOT NULL,
  PRIMARY KEY (`reservation_room_id`),
  UNIQUE KEY `uq_rr_reservation_room` (`reservation_id`,`room_id`),
  KEY `fk_rr_room` (`room_id`),
  CONSTRAINT `fk_rr_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`reservation_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_rr_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`room_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ck_rr_rate` CHECK ((`rate_per_night` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `reservations`;
CREATE TABLE `reservations` (
  `reservation_id` int NOT NULL AUTO_INCREMENT,
  `guest_id` int NOT NULL,
  `created_by` int DEFAULT NULL,
  `source` enum('walk_in','phone','online') NOT NULL DEFAULT 'walk_in',
  `check_in_date` date NOT NULL,
  `check_out_date` date NOT NULL,
  `adults` tinyint NOT NULL,
  `children` tinyint NOT NULL DEFAULT '0',
  `status` enum('pending','confirmed','checked_in','checked_out','cancelled','no_show') NOT NULL DEFAULT 'pending',
  `special_requests` text,
  `cancel_reason` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`reservation_id`),
  KEY `fk_res_guest` (`guest_id`),
  KEY `fk_res_created_by` (`created_by`),
  KEY `idx_res_status` (`status`),
  KEY `idx_res_dates` (`check_in_date`,`check_out_date`),
  CONSTRAINT `fk_res_created_by` FOREIGN KEY (`created_by`) REFERENCES `staff` (`staff_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_res_guest` FOREIGN KEY (`guest_id`) REFERENCES `guests` (`guest_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ck_res_adults` CHECK ((`adults` >= 1)),
  CONSTRAINT `ck_res_dates` CHECK ((`check_out_date` > `check_in_date`))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles` (
  `role_id` int NOT NULL AUTO_INCREMENT,
  `role_name` varchar(50) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `uq_roles_name` (`role_name`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `room_type_amenities`;
CREATE TABLE `room_type_amenities` (
  `room_type_id` int NOT NULL,
  `amenity_id` int NOT NULL,
  PRIMARY KEY (`room_type_id`,`amenity_id`),
  KEY `fk_rta_amenity` (`amenity_id`),
  CONSTRAINT `fk_rta_amenity` FOREIGN KEY (`amenity_id`) REFERENCES `amenities` (`amenity_id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_rta_room_type` FOREIGN KEY (`room_type_id`) REFERENCES `room_types` (`room_type_id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `room_types`;
CREATE TABLE `room_types` (
  `room_type_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `description` text,
  `base_price` decimal(10,2) NOT NULL,
  `max_adults` tinyint NOT NULL,
  `max_children` tinyint NOT NULL DEFAULT '0',
  `bed_type` varchar(30) DEFAULT NULL,
  PRIMARY KEY (`room_type_id`),
  UNIQUE KEY `uq_room_types_name` (`name`),
  CONSTRAINT `ck_room_types_adults` CHECK ((`max_adults` >= 1)),
  CONSTRAINT `ck_room_types_price` CHECK ((`base_price` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `rooms`;
CREATE TABLE `rooms` (
  `room_id` int NOT NULL AUTO_INCREMENT,
  `room_number` varchar(10) NOT NULL,
  `floor` tinyint DEFAULT NULL,
  `room_type_id` int NOT NULL,
  `status` enum('available','occupied','cleaning','maintenance') NOT NULL DEFAULT 'available',
  `notes` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`room_id`),
  UNIQUE KEY `uq_rooms_number` (`room_number`),
  KEY `fk_rooms_type` (`room_type_id`),
  KEY `idx_rooms_status` (`status`),
  CONSTRAINT `fk_rooms_type` FOREIGN KEY (`room_type_id`) REFERENCES `room_types` (`room_type_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `service_orders`;
CREATE TABLE `service_orders` (
  `order_id` int NOT NULL AUTO_INCREMENT,
  `stay_id` int NOT NULL,
  `service_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `unit_price` decimal(10,2) NOT NULL,
  `status` enum('ordered','delivered','cancelled') NOT NULL DEFAULT 'ordered',
  `ordered_by` int NOT NULL,
  `ordered_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`order_id`),
  KEY `fk_so_stay` (`stay_id`),
  KEY `fk_so_service` (`service_id`),
  KEY `fk_so_ordered_by` (`ordered_by`),
  CONSTRAINT `fk_so_ordered_by` FOREIGN KEY (`ordered_by`) REFERENCES `staff` (`staff_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_so_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`service_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_so_stay` FOREIGN KEY (`stay_id`) REFERENCES `stays` (`stay_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ck_so_price` CHECK ((`unit_price` >= 0)),
  CONSTRAINT `ck_so_qty` CHECK ((`quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `services`;
CREATE TABLE `services` (
  `service_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `category` enum('restaurant','laundry','spa','transport','minibar','other') NOT NULL DEFAULT 'other',
  `price` decimal(10,2) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`service_id`),
  UNIQUE KEY `uq_services_name` (`name`),
  CONSTRAINT `ck_services_price` CHECK ((`price` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `staff`;
CREATE TABLE `staff` (
  `staff_id` int NOT NULL AUTO_INCREMENT,
  `role_id` int NOT NULL,
  `first_name` varchar(50) NOT NULL,
  `last_name` varchar(50) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `hire_date` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`staff_id`),
  UNIQUE KEY `uq_staff_username` (`username`),
  UNIQUE KEY `uq_staff_email` (`email`),
  KEY `fk_staff_role` (`role_id`),
  CONSTRAINT `fk_staff_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `stays`;
CREATE TABLE `stays` (
  `stay_id` int NOT NULL AUTO_INCREMENT,
  `reservation_room_id` int NOT NULL,
  `actual_check_in` datetime NOT NULL,
  `actual_check_out` datetime DEFAULT NULL,
  `checked_in_by` int NOT NULL,
  `checked_out_by` int DEFAULT NULL,
  PRIMARY KEY (`stay_id`),
  UNIQUE KEY `uq_stays_rr` (`reservation_room_id`),
  KEY `fk_stays_in_by` (`checked_in_by`),
  KEY `fk_stays_out_by` (`checked_out_by`),
  CONSTRAINT `fk_stays_in_by` FOREIGN KEY (`checked_in_by`) REFERENCES `staff` (`staff_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_stays_out_by` FOREIGN KEY (`checked_out_by`) REFERENCES `staff` (`staff_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_stays_rr` FOREIGN KEY (`reservation_room_id`) REFERENCES `reservation_rooms` (`reservation_room_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ck_stays_times` CHECK (((`actual_check_out` is null) or (`actual_check_out` >= `actual_check_in`)))
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Data for table `amenities`
INSERT INTO `amenities` (`amenity_id`, `name`) VALUES (2, 'Air conditioning');
INSERT INTO `amenities` (`amenity_id`, `name`) VALUES (6, 'Breakfast included');
INSERT INTO `amenities` (`amenity_id`, `name`) VALUES (4, 'Mini-bar');
INSERT INTO `amenities` (`amenity_id`, `name`) VALUES (5, 'Room safe');
INSERT INTO `amenities` (`amenity_id`, `name`) VALUES (3, 'TV');
INSERT INTO `amenities` (`amenity_id`, `name`) VALUES (1, 'WiFi');

-- Data for table `guests`
INSERT INTO `guests` (`guest_id`, `first_name`, `last_name`, `gender`, `date_of_birth`, `email`, `phone`, `nationality`, `address`, `city`, `id_type`, `id_number`, `created_at`) VALUES (1, 'hammad', 'akram', NULL, NULL, 'hamad.akram70@gmail.com', '123456', NULL, NULL, NULL, NULL, NULL, '2026-11-15 10:45:16');
INSERT INTO `guests` (`guest_id`, `first_name`, `last_name`, `gender`, `date_of_birth`, `email`, `phone`, `nationality`, `address`, `city`, `id_type`, `id_number`, `created_at`) VALUES (2, 'anzel', 'khan', 'M', NULL, 'hamad.akram70@gmail.com', '1234567', 'Pakistani', NULL, NULL, NULL, NULL, '2026-11-15 13:17:08');

-- Data for table `housekeeping_tasks`
INSERT INTO `housekeeping_tasks` (`task_id`, `room_id`, `assigned_to`, `status`, `created_at`, `completed_at`, `notes`) VALUES (1, 3, 5, 'done', '2026-11-15 11:08:00', '2026-11-15 13:29:14', 'Guest checkout turnover. Completed at 09:07 PM. Requires linen change, sanitization, and minibar restock.');
INSERT INTO `housekeeping_tasks` (`task_id`, `room_id`, `assigned_to`, `status`, `created_at`, `completed_at`, `notes`) VALUES (2, 3, 6, 'done', '2026-11-15 11:40:42', '2026-11-16 01:07:43', '[MAINTENANCE] zbc | RESOLVED: Repaired and verified.');
INSERT INTO `housekeeping_tasks` (`task_id`, `room_id`, `assigned_to`, `status`, `created_at`, `completed_at`, `notes`) VALUES (3, 3, 6, 'done', '2026-11-15 11:41:06', '2026-11-15 12:27:57', '[MAINTENANCE] yhg | RESOLVED: Repaired and verified.');
INSERT INTO `housekeeping_tasks` (`task_id`, `room_id`, `assigned_to`, `status`, `created_at`, `completed_at`, `notes`) VALUES (4, 7, 6, 'done', '2026-11-15 12:16:07', '2026-11-15 12:17:15', '[MAINTENANCE] [Source: Room Inspection] Scheduled room maintenance and physical defect inspection | RESOLVED: Repaired and verified.');
INSERT INTO `housekeeping_tasks` (`task_id`, `room_id`, `assigned_to`, `status`, `created_at`, `completed_at`, `notes`) VALUES (5, 7, 6, 'done', '2026-11-15 12:16:07', '2026-11-15 12:27:40', '[MAINTENANCE] [Source: Room Inspection] Scheduled room maintenance and physical defect inspection | RESOLVED: Repaired and verified.');
INSERT INTO `housekeeping_tasks` (`task_id`, `room_id`, `assigned_to`, `status`, `created_at`, `completed_at`, `notes`) VALUES (6, 3, 6, 'done', '2026-11-15 12:19:54', '2026-11-16 01:08:01', '[MAINTENANCE] [Source: Reception Desk] Technical defect reported by Front Desk (Reported by Frontdesk Receptionist) | RESOLVED: Repaired and verified.');
INSERT INTO `housekeeping_tasks` (`task_id`, `room_id`, `assigned_to`, `status`, `created_at`, `completed_at`, `notes`) VALUES (10, 8, 6, 'done', '2026-11-15 13:10:22', '2026-11-15 15:08:40', '[MAINTENANCE] [APPROVED ESCALATION #issue-1] Main AC Chiller Compressor Burnout: HVAC central compressor in Room 302 burnt out. Requires replacement compressor unit and certified external HVAC technician. (Authorized by System Administrator) | RESOLVED: R');
INSERT INTO `housekeeping_tasks` (`task_id`, `room_id`, `assigned_to`, `status`, `created_at`, `completed_at`, `notes`) VALUES (19, 1, 6, 'in_progress', '2026-11-15 15:12:57', NULL, '[MAINTENANCE] [Source: Reception Desk] Technical defect reported by Front Desk (Reported by Frontdesk Receptionist)');
INSERT INTO `housekeeping_tasks` (`task_id`, `room_id`, `assigned_to`, `status`, `created_at`, `completed_at`, `notes`) VALUES (20, 4, 6, 'done', '2026-11-15 15:14:23', '2026-11-16 01:07:21', '[MAINTENANCE] [Source: Housekeeping] yes (Reported by Lead Housekeeper) | RESOLVED: Repaired and verified.');
INSERT INTO `housekeeping_tasks` (`task_id`, `room_id`, `assigned_to`, `status`, `created_at`, `completed_at`, `notes`) VALUES (25, 4, 6, 'done', '2026-11-15 23:43:29', '2026-11-16 01:07:03', '[MAINTENANCE] [Source: Housekeeping] neds (Reported by Lead Housekeeper) | RESOLVED: Repaired and verified.');
INSERT INTO `housekeeping_tasks` (`task_id`, `room_id`, `assigned_to`, `status`, `created_at`, `completed_at`, `notes`) VALUES (26, 2, 6, 'done', '2026-11-15 23:46:05', '2026-11-16 01:03:03', '[MAINTENANCE] [Source: Housekeeping] broken bulbs (Reported by Lead Housekeeper) | RESOLVED: Repaired and verified.');
INSERT INTO `housekeeping_tasks` (`task_id`, `room_id`, `assigned_to`, `status`, `created_at`, `completed_at`, `notes`) VALUES (31, 2, 6, 'done', '2026-11-16 01:05:24', '2026-11-16 01:06:43', '[MAINTENANCE] [Source: Housekeeping] mmmmmmmmmm (Reported by Lead Housekeeper) | RESOLVED: Repaired and verified.');
INSERT INTO `housekeeping_tasks` (`task_id`, `room_id`, `assigned_to`, `status`, `created_at`, `completed_at`, `notes`) VALUES (32, 2, NULL, 'pending', '2026-11-16 01:06:48', NULL, 'Post-repair cleaning turnover for Room 102. Clean debris, dust, and sanitize following completed repair.');
INSERT INTO `housekeeping_tasks` (`task_id`, `room_id`, `assigned_to`, `status`, `created_at`, `completed_at`, `notes`) VALUES (33, 4, NULL, 'pending', '2026-11-16 01:07:27', NULL, '[BLOCKED BY MAINTENANCE] Post-repair cleaning turnover for Room 201. Clean debris, dust, and sanitize following completed repair.');
INSERT INTO `housekeeping_tasks` (`task_id`, `room_id`, `assigned_to`, `status`, `created_at`, `completed_at`, `notes`) VALUES (34, 3, 5, 'done', '2026-11-16 01:08:06', '2026-11-16 05:14:04', 'Post-repair cleaning turnover for Room 103. Clean debris, dust, and sanitize following completed repair.');
INSERT INTO `housekeeping_tasks` (`task_id`, `room_id`, `assigned_to`, `status`, `created_at`, `completed_at`, `notes`) VALUES (35, 4, 6, 'done', '2026-11-16 05:15:30', '2026-11-16 05:20:28', '[MAINTENANCE] [Source: Housekeeping] hamza peed on bed (Reported by Lead Housekeeper) | RESOLVED: washed');

-- Data for table `invoices`
INSERT INTO `invoices` (`invoice_id`, `reservation_id`, `issue_date`, `subtotal`, `tax_amount`, `discount_amount`, `total_amount`, `status`, `generated_by`) VALUES (1, 1, '2026-11-15 10:45:21', '9500.00', '0.00', '0.00', '9500.00', 'paid', 2);
INSERT INTO `invoices` (`invoice_id`, `reservation_id`, `issue_date`, `subtotal`, `tax_amount`, `discount_amount`, `total_amount`, `status`, `generated_by`) VALUES (3, 2, '2026-11-15 23:50:03', '6000.00', '0.00', '0.00', '6000.00', 'paid', 4);
INSERT INTO `invoices` (`invoice_id`, `reservation_id`, `issue_date`, `subtotal`, `tax_amount`, `discount_amount`, `total_amount`, `status`, `generated_by`) VALUES (4, 4, '2026-11-16 05:02:36', '12000.00', '0.00', '0.00', '12000.00', 'paid', 1);

-- Data for table `payments`
INSERT INTO `payments` (`payment_id`, `reservation_id`, `amount`, `method`, `transaction_ref`, `processed_by`, `paid_at`) VALUES (2, 2, '6000.00', 'cash', 'PAY-CASH-1794804604846', 4, '2026-11-15 23:50:06');
INSERT INTO `payments` (`payment_id`, `reservation_id`, `amount`, `method`, `transaction_ref`, `processed_by`, `paid_at`) VALUES (3, 1, '9500.00', 'cash', 'PAY-CASH-1794804627330', 4, '2026-11-15 23:50:28');
INSERT INTO `payments` (`payment_id`, `reservation_id`, `amount`, `method`, `transaction_ref`, `processed_by`, `paid_at`) VALUES (4, 4, '12000.00', 'cash', 'PAY-CASH-1794823883031', 4, '2026-11-16 05:11:23');

-- Data for table `reservation_rooms`
INSERT INTO `reservation_rooms` (`reservation_room_id`, `reservation_id`, `room_id`, `rate_per_night`) VALUES (1, 1, 3, '9500.00');
INSERT INTO `reservation_rooms` (`reservation_room_id`, `reservation_id`, `room_id`, `rate_per_night`) VALUES (2, 2, 2, '6000.00');
INSERT INTO `reservation_rooms` (`reservation_room_id`, `reservation_id`, `room_id`, `rate_per_night`) VALUES (4, 4, 2, '6000.00');

-- Data for table `reservations`
INSERT INTO `reservations` (`reservation_id`, `guest_id`, `created_by`, `source`, `check_in_date`, `check_out_date`, `adults`, `children`, `status`, `special_requests`, `cancel_reason`, `created_at`) VALUES (1, 1, 2, 'walk_in', '2026-11-14 19:00:00', '2026-11-15 19:00:00', 1, 0, 'checked_out', NULL, NULL, '2026-11-15 10:45:19');
INSERT INTO `reservations` (`reservation_id`, `guest_id`, `created_by`, `source`, `check_in_date`, `check_out_date`, `adults`, `children`, `status`, `special_requests`, `cancel_reason`, `created_at`) VALUES (2, 2, NULL, 'online', '2026-11-15 19:00:00', '2026-11-16 19:00:00', 1, 0, 'checked_out', 'hi bro', NULL, '2026-11-15 13:17:09');
INSERT INTO `reservations` (`reservation_id`, `guest_id`, `created_by`, `source`, `check_in_date`, `check_out_date`, `adults`, `children`, `status`, `special_requests`, `cancel_reason`, `created_at`) VALUES (4, 2, NULL, 'online', '2026-11-16 19:00:00', '2026-11-18 19:00:00', 1, 0, 'confirmed', NULL, NULL, '2026-11-16 05:02:30');

-- Data for table `roles`
INSERT INTO `roles` (`role_id`, `role_name`, `description`) VALUES (1, 'Admin', 'Full system access, user management and billing overrides');
INSERT INTO `roles` (`role_id`, `role_name`, `description`) VALUES (2, 'Manager', 'Operations oversight, discounts and invoice adjustments');
INSERT INTO `roles` (`role_id`, `role_name`, `description`) VALUES (3, 'Receptionist', 'Guests, reservations, check-in/out, service orders and payments');
INSERT INTO `roles` (`role_id`, `role_name`, `description`) VALUES (4, 'Housekeeping', 'Room cleaning tasks and room status updates');
INSERT INTO `roles` (`role_id`, `role_name`, `description`) VALUES (5, 'Accountant', 'Invoices, payments and financial reports');
INSERT INTO `roles` (`role_id`, `role_name`, `description`) VALUES (6, 'Maintenance', 'Room repairs, technical fixes, and physical maintenance');

-- Data for table `room_type_amenities`
INSERT INTO `room_type_amenities` (`room_type_id`, `amenity_id`) VALUES (1, 1);
INSERT INTO `room_type_amenities` (`room_type_id`, `amenity_id`) VALUES (2, 1);
INSERT INTO `room_type_amenities` (`room_type_id`, `amenity_id`) VALUES (3, 1);
INSERT INTO `room_type_amenities` (`room_type_id`, `amenity_id`) VALUES (4, 1);
INSERT INTO `room_type_amenities` (`room_type_id`, `amenity_id`) VALUES (1, 2);
INSERT INTO `room_type_amenities` (`room_type_id`, `amenity_id`) VALUES (2, 2);
INSERT INTO `room_type_amenities` (`room_type_id`, `amenity_id`) VALUES (3, 2);
INSERT INTO `room_type_amenities` (`room_type_id`, `amenity_id`) VALUES (4, 2);
INSERT INTO `room_type_amenities` (`room_type_id`, `amenity_id`) VALUES (1, 3);
INSERT INTO `room_type_amenities` (`room_type_id`, `amenity_id`) VALUES (2, 3);
INSERT INTO `room_type_amenities` (`room_type_id`, `amenity_id`) VALUES (3, 3);
INSERT INTO `room_type_amenities` (`room_type_id`, `amenity_id`) VALUES (4, 3);
INSERT INTO `room_type_amenities` (`room_type_id`, `amenity_id`) VALUES (3, 4);
INSERT INTO `room_type_amenities` (`room_type_id`, `amenity_id`) VALUES (4, 4);
INSERT INTO `room_type_amenities` (`room_type_id`, `amenity_id`) VALUES (3, 5);
INSERT INTO `room_type_amenities` (`room_type_id`, `amenity_id`) VALUES (4, 5);
INSERT INTO `room_type_amenities` (`room_type_id`, `amenity_id`) VALUES (4, 6);

-- Data for table `room_types`
INSERT INTO `room_types` (`room_type_id`, `name`, `description`, `base_price`, `max_adults`, `max_children`, `bed_type`) VALUES (1, 'Single', 'Compact room for one guest', '6000.00', 1, 0, 'Single bed');
INSERT INTO `room_types` (`room_type_id`, `name`, `description`, `base_price`, `max_adults`, `max_children`, `bed_type`) VALUES (2, 'Double', 'Comfortable room for two guests', '9500.00', 2, 1, 'Queen bed');
INSERT INTO `room_types` (`room_type_id`, `name`, `description`, `base_price`, `max_adults`, `max_children`, `bed_type`) VALUES (3, 'Deluxe', 'Spacious room with city view', '14000.00', 2, 2, 'King bed');
INSERT INTO `room_types` (`room_type_id`, `name`, `description`, `base_price`, `max_adults`, `max_children`, `bed_type`) VALUES (4, 'Suite', 'Separate living area and premium fittings', '25000.00', 4, 2, 'King bed + sofa bed');

-- Data for table `rooms`
INSERT INTO `rooms` (`room_id`, `room_number`, `floor`, `room_type_id`, `status`, `notes`) VALUES (1, '101', 1, 1, 'maintenance', 'Maintenance defect reported by Front Desk.');
INSERT INTO `rooms` (`room_id`, `room_number`, `floor`, `room_type_id`, `status`, `notes`) VALUES (2, '102', 1, 1, 'cleaning', 'mmmmmmmmmm');
INSERT INTO `rooms` (`room_id`, `room_number`, `floor`, `room_type_id`, `status`, `notes`) VALUES (3, '103', 1, 2, 'available', NULL);
INSERT INTO `rooms` (`room_id`, `room_number`, `floor`, `room_type_id`, `status`, `notes`) VALUES (4, '201', 2, 2, 'cleaning', 'hamza peed on bed');
INSERT INTO `rooms` (`room_id`, `room_number`, `floor`, `room_type_id`, `status`, `notes`) VALUES (5, '202', 2, 2, 'available', NULL);
INSERT INTO `rooms` (`room_id`, `room_number`, `floor`, `room_type_id`, `status`, `notes`) VALUES (6, '203', 2, 3, 'available', NULL);
INSERT INTO `rooms` (`room_id`, `room_number`, `floor`, `room_type_id`, `status`, `notes`) VALUES (7, '301', 3, 3, 'available', NULL);
INSERT INTO `rooms` (`room_id`, `room_number`, `floor`, `room_type_id`, `status`, `notes`) VALUES (8, '302', 3, 3, 'available', NULL);
INSERT INTO `rooms` (`room_id`, `room_number`, `floor`, `room_type_id`, `status`, `notes`) VALUES (9, '401', 4, 4, 'available', NULL);
INSERT INTO `rooms` (`room_id`, `room_number`, `floor`, `room_type_id`, `status`, `notes`) VALUES (10, '402', 4, 4, 'available', NULL);

-- Data for table `services`
INSERT INTO `services` (`service_id`, `name`, `category`, `price`, `is_active`) VALUES (1, 'Room service meal', 'restaurant', '1500.00', 1);
INSERT INTO `services` (`service_id`, `name`, `category`, `price`, `is_active`) VALUES (2, 'Breakfast buffet', 'restaurant', '1200.00', 1);
INSERT INTO `services` (`service_id`, `name`, `category`, `price`, `is_active`) VALUES (3, 'Laundry (per item)', 'laundry', '300.00', 1);
INSERT INTO `services` (`service_id`, `name`, `category`, `price`, `is_active`) VALUES (4, 'Spa massage', 'spa', '5000.00', 1);
INSERT INTO `services` (`service_id`, `name`, `category`, `price`, `is_active`) VALUES (5, 'Airport transfer', 'transport', '3500.00', 1);
INSERT INTO `services` (`service_id`, `name`, `category`, `price`, `is_active`) VALUES (6, 'Mini-bar item', 'minibar', '400.00', 1);
INSERT INTO `services` (`service_id`, `name`, `category`, `price`, `is_active`) VALUES (7, 'Extra bed', 'other', '2000.00', 1);

-- Data for table `staff`
INSERT INTO `staff` (`staff_id`, `role_id`, `first_name`, `last_name`, `username`, `password_hash`, `email`, `phone`, `hire_date`, `is_active`, `created_at`) VALUES (1, 1, 'System', 'Gateway', 'system_gateway', '$argon2id$v=19$m=65536,t=3,p=4$EnNW718lEDw1IgsiwOCBxg$TrQP21cD0+uX+EptwuH65XyCKFskcJ3L+f3BNzYDxAk', 'system@hotel.internal', '0000000000', '2026-11-14 19:00:00', 1, '2026-11-15 08:24:13');
INSERT INTO `staff` (`staff_id`, `role_id`, `first_name`, `last_name`, `username`, `password_hash`, `email`, `phone`, `hire_date`, `is_active`, `created_at`) VALUES (2, 1, 'System', 'Administrator', 'admin', '$argon2id$v=19$m=65536,t=3,p=4$iDZjEzJm3XPorAMYSPYjYQ$hO3hXWjbyBFEGbMdIkq6lgu1hGEMp7OLG5FpvSxrbjE', 'admin@hotel.com', '+923001234567', '2026-11-14 19:00:00', 1, '2026-11-15 08:24:17');
INSERT INTO `staff` (`staff_id`, `role_id`, `first_name`, `last_name`, `username`, `password_hash`, `email`, `phone`, `hire_date`, `is_active`, `created_at`) VALUES (3, 2, 'Hotel', 'Manager', 'manager', '$argon2id$v=19$m=65536,t=3,p=4$n3/Nv7wazvIBLyDN5HSEew$HDnczPVHpGMj0vV5nqsa4zjdd/7UBay7bi9mP1cGKpw', 'manager@hotel.com', '+923002345678', '2026-11-14 19:00:00', 1, '2026-11-15 08:24:19');
INSERT INTO `staff` (`staff_id`, `role_id`, `first_name`, `last_name`, `username`, `password_hash`, `email`, `phone`, `hire_date`, `is_active`, `created_at`) VALUES (4, 3, 'Frontdesk', 'Receptionist', 'receptionist', '$argon2id$v=19$m=65536,t=3,p=4$AGbw0aYxOCnFR8qIMeiARA$2755+SXENOR5sRd2Y9g9trVJHV7Ag/lE/wT5ITntwjA', 'reception@hotel.com', '+923003456789', '2026-11-14 19:00:00', 1, '2026-11-15 08:24:22');
INSERT INTO `staff` (`staff_id`, `role_id`, `first_name`, `last_name`, `username`, `password_hash`, `email`, `phone`, `hire_date`, `is_active`, `created_at`) VALUES (5, 4, 'Lead', 'Housekeeper', 'housekeeper', '$argon2id$v=19$m=65536,t=3,p=4$WRwvZig1pFOovss2OfNUUg$SP081c9vm9pjodiWD3LPmSvThJNv1F89mos8qWBumqE', 'housekeeping@hotel.com', '+923004567890', '2026-11-14 19:00:00', 1, '2026-11-15 08:24:25');
INSERT INTO `staff` (`staff_id`, `role_id`, `first_name`, `last_name`, `username`, `password_hash`, `email`, `phone`, `hire_date`, `is_active`, `created_at`) VALUES (6, 6, 'Chief', 'Technician', 'maintenance', '$argon2id$v=19$m=65536,t=3,p=4$ORRBa/cuyECew20kdUz/bQ$8wYCnzu1z5KEphGFvdkjJ+6+ylW/2/Mfx7M3qNgggLg', 'maintenance@hotel.com', '+923005678901', '2026-11-14 19:00:00', 1, '2026-11-15 09:43:34');

-- Data for table `stays`
INSERT INTO `stays` (`stay_id`, `reservation_room_id`, `actual_check_in`, `actual_check_out`, `checked_in_by`, `checked_out_by`) VALUES (1, 1, '2026-11-15 10:46:31', '2026-11-15 11:07:42', 2, 4);
INSERT INTO `stays` (`stay_id`, `reservation_room_id`, `actual_check_in`, `actual_check_out`, `checked_in_by`, `checked_out_by`) VALUES (2, 2, '2026-11-15 14:13:01', '2026-11-15 15:11:53', 4, 4);

SET FOREIGN_KEY_CHECKS = 1;
