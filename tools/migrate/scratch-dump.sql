-- MySQL dump (synthetic fixture)
/*!40101 SET NAMES utf8mb4 */;
CREATE TABLE `cards` (id int);
INSERT INTO `cards` VALUES (1,'Alpha One','alpha_one',NULL,NULL,NULL,NULL,'2020-01-01 00:00:00','2020-01-01 00:00:00',1,1,NULL,NULL,NULL,0,2,'<p>The first alpha card.</p>'),(2,'Beta Page','beta_page',NULL,NULL,NULL,NULL,'2020-01-01 00:00:00','2020-01-01 00:00:00',1,1,NULL,NULL,NULL,0,2,'Beta content with \'quotes\' and\\backslash.'),(3,'Alpha One+child',NULL,NULL,1,4,NULL,'2020-01-01 00:00:00','2020-01-01 00:00:00',1,1,NULL,NULL,NULL,0,2,'child content'),(4,'child','child',NULL,NULL,NULL,NULL,'2020-01-01 00:00:00','2020-01-01 00:00:00',1,1,NULL,NULL,NULL,0,2,NULL),(5,'Trashed Card','trashed_card',NULL,NULL,NULL,NULL,'2020-01-01 00:00:00','2020-01-01 00:00:00',1,1,NULL,NULL,NULL,1,2,'gone but kept'),(6,'Gamma Doc','gamma_doc',NULL,NULL,NULL,NULL,'2020-01-01 00:00:00','2020-01-01 00:00:00',1,1,NULL,NULL,NULL,0,2,'Gamma body text.\nSecond line.\tTabbed.');
INSERT INTO `card_acts` VALUES (11,1,1,'2020-01-01 00:00:00','127.0.0.1'),(12,3,1,'2020-01-01 00:00:00',NULL);
INSERT INTO `card_actions` VALUES (21,1,11,1,0,NULL,'create'),(22,3,12,1,0,NULL,'create'),(23,4,NULL,12,1,0,NULL);
INSERT INTO `card_changes` VALUES (31,21,0,'Alpha One'),(32,21,2,'<p>The first alpha card.</p>'),(33,22,2,'child content');
INSERT INTO `card_references` VALUES (41,3,'child',4,'I',1);
INSERT INTO `some_site_custom_table` VALUES (1,'x'),(2,'y');
