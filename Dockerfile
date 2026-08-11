FROM php:8.2-apache
RUN docker-php-ext-install pdo_mysql
RUN a2enmod rewrite
ENV APACHE_DOCUMENT_ROOT=/var/www/html
WORKDIR /var/www/html
COPY . /var/www/html/
RUN chown -R www-data:www-data /var/www/html \
    && find /var/www/html -type d -exec chmod 755 {} \; \
    && find /var/www/html -type f -exec chmod 644 {} \;
EXPOSE 80
CMD ["apache2-foreground"]
