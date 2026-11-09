-- ============================================================
--  RescueNet — MySQL / MariaDB schema
--  Shared by Resident app, Responder app and Admin dashboard.
--
--  Design note:
--  Each table has REAL COLUMNS for the fields you'll want to
--  browse/filter in phpMyAdmin (id, name, status, timestamps...)
--  PLUS a `data` JSON column that holds the complete object.
--  The API returns `data`, so the phone apps need zero changes.
-- ============================================================

CREATE DATABASE IF NOT EXISTS rescuenet
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE rescuenet;

-- ------------------------------------------------------------
-- RESIDENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS residents (
  id            VARCHAR(64)  NOT NULL,
  first_name    VARCHAR(120) NULL,
  last_name     VARCHAR(120) NULL,
  email         VARCHAR(190) NULL,
  phone         VARCHAR(32)  NULL,
  status        VARCHAR(24)  NOT NULL DEFAULT 'pending',
  registered_at DATETIME     NULL,
  approved_at   DATETIME     NULL,
  rejected_at   DATETIME     NULL,
  data          JSON         NOT NULL,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_res_email  (email),
  KEY idx_res_phone  (phone),
  KEY idx_res_status (status)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- RESPONDERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS responders (
  id              VARCHAR(64)  NOT NULL,
  name            VARCHAR(160) NULL,
  role            VARCHAR(80)  NULL,
  skill           VARCHAR(160) NULL,
  phone           VARCHAR(32)  NULL,
  email           VARCHAR(190) NULL,
  status          VARCHAR(32)  NULL,
  approval_status VARCHAR(24)  NULL,
  lat             DECIMAL(10,7) NULL,
  lng             DECIMAL(10,7) NULL,
  joined          DATE         NULL,
  approved_at     DATETIME     NULL,
  rejected_at     DATETIME     NULL,
  data            JSON         NOT NULL,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rs_phone  (phone),
  KEY idx_rs_email  (email),
  KEY idx_rs_approval (approval_status)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ALERTS (SOS)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
  id         VARCHAR(64)  NOT NULL,
  resident   VARCHAR(190) NULL,
  type       VARCHAR(64)  NULL,
  status     VARCHAR(32)  NULL,
  severity   VARCHAR(32)  NULL,
  lat        DECIMAL(10,7) NULL,
  lng        DECIMAL(10,7) NULL,
  created_at DATETIME     NULL,
  data       JSON         NOT NULL,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_al_status  (status),
  KEY idx_al_created (created_at)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- REPORTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id         VARCHAR(64)  NOT NULL,
  resident   VARCHAR(190) NULL,
  type       VARCHAR(64)  NULL,
  status     VARCHAR(32)  NULL,
  created_at DATETIME     NULL,
  data       JSON         NOT NULL,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rep_created (created_at)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ASSIGNMENTS (admin dispatch -> responder)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignments (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  case_id      VARCHAR(64)  NOT NULL,
  responder_id VARCHAR(64)  NOT NULL,
  status       VARCHAR(32)  NULL,
  data         JSON         NOT NULL,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_case_responder (case_id, responder_id),
  KEY idx_as_responder (responder_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- HOUSEHOLDS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS households (
  id         VARCHAR(64) NOT NULL,
  status     VARCHAR(32) NULL,
  data       JSON        NOT NULL,
  updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ANNOUNCEMENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id         VARCHAR(64)  NOT NULL,
  title      VARCHAR(255) NULL,
  created_at DATETIME     NULL,
  data       JSON         NOT NULL,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ann_created (created_at)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- RESOURCES (guides / hotlines / checklists)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resources (
  id         VARCHAR(64)  NOT NULL,
  title      VARCHAR(255) NULL,
  data       JSON         NOT NULL,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- RESPONDER LOCATIONS (live GPS — one row per responder)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS responder_locations (
  responder_id VARCHAR(64)   NOT NULL,
  lat          DECIMAL(10,7) NOT NULL,
  lng          DECIMAL(10,7) NOT NULL,
  accuracy     DECIMAL(10,2) NULL,
  name         VARCHAR(160)  NULL,
  role         VARCHAR(80)   NULL,
  status       VARCHAR(32)   NULL,
  updated_at   DATETIME      NULL,
  PRIMARY KEY (responder_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- OTP CODES  (survive a server restart — previously in RAM only)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otps (
  otp_key       VARCHAR(190) NOT NULL,
  code_hash     CHAR(64)     NOT NULL,
  phone         VARCHAR(32)  NULL,
  expires_at    DATETIME     NOT NULL,
  attempts      INT          NOT NULL DEFAULT 0,
  last_sent_at  DATETIME     NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (otp_key),
  KEY idx_otp_expires (expires_at)
) ENGINE=InnoDB;