#!/bin/bash -x

DISTRO=wheezy
MIRROR=http://ftp.gr.debian.org/debian
EXTRA_PACKAGES=acpi-support-base,console-tools,udev,linux-image-amd64,network-manager,openssh-server

: ${DISK0:=/var/lib/snf-deploy/vcluster/disk0}
: ${DISK1:=/var/lib/snf-deploy/vcluster/disk1}
: ${HOSTNAME:=vc}
: ${SIZE:=2G}
: ${DISTRO:=wheezy}
: ${MIRROR:=http://ftp.gr.debian.org/debian}
: ${EXTRA_PACKAGES:=acpi-support-base,console-tools,udev,linux-image-amd64,network-manager}
: ${NMHOOK:=etc/NetworkManager/dispatcher.d/02hostname}

set -e

truncate -s $SIZE $DISK0
truncate -s $SIZE $DISK1

# sfdisk -H 255 -S 63 -u S --quiet --Linux $DISK0 <<EOF
# 2048,,L,*
# EOF

/sbin/parted -s $DISK0 mklabel msdos
/sbin/parted -s $DISK0 mkpart primary ext3 2048s 100%
/sbin/parted -s $DISK0 set 1 boot on

BLOCKDEV=$(losetup -f --show $DISK0)

PARTITION=$(kpartx -l $BLOCKDEV | awk '{print $1}')

kpartx -a $BLOCKDEV

FSDEV=/dev/mapper/$PARTITION

mkfs.ext3 $FSDEV

TEMP=$(mktemp -d)

mount $FSDEV $TEMP

debootstrap --include $EXTRA_PACKAGES $DISTRO $TEMP $MIRROR

BLKID=$(blkid -o value -s UUID $FSDEV)

cat >> $TEMP/etc/fstab <<EOF
proc            /proc           proc    defaults        0       0
UUID=$BLKID     /               ext3    defaults        0       1
EOF

echo $HOSTNAME > $TEMP/etc/hostname

echo "T0:23:respawn:/sbin/getty ttyS0 38400" >> $TEMP/etc/inittab

mkdir -p $TEMP/$(dirname $NMHOOK)

cat >> $TEMP/$NMHOOK <<EOF
#!/bin/bash

if [ -n "\$DHCP4_HOST_NAME" ]; then
    echo \$DHCP4_HOST_NAME > /etc/hostname
    hostname \$DHCP4_HOST_NAME
fi
EOF

chmod +x $TEMP/$NMHOOK

chroot $TEMP passwd -d root

cat >> $TEMP/etc/ssh/sshd_config <<EOF
PermitEmptyPasswords yes
EOF

cat >> $TEMP/etc/pam.d/sshd <<EOF
auth      required  pam_unix.so shadow nullok
EOF

cat >> $TEMP/etc/securetty <<EOF
ssh
EOF

umount $TEMP

kpartx -d $BLOCKDEV

losetup -d $BLOCKDEV
